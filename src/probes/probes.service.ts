import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { performance } from 'node:perf_hooks';
import { inflateSync, gunzipSync } from 'node:zlib';
import { decode as msg_decode } from '@msgpack/msgpack';
import WebSocket from 'ws';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../database/redis/redis.service';
import { DfServer } from '../database/database.types';
import { ProbeResult } from './probe.types';
import { CreateServerDto } from './server.dto';
import { HttpResponse, ServerScannerRegistry } from './server-scanners';
import { convertRayData } from '../converters/ray.converter';

@Injectable()
export class ProbesService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly scannerRegistry = new ServerScannerRegistry();

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.PROBE_INTERVAL_MS ?? 0);

    if (Number.isFinite(intervalMs) && intervalMs > 0) {
      this.timer = setInterval(() => {
        void this.probeAll();
      }, intervalMs);
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async listServers(): Promise<(DfServer & { detail?: any })[]> {
    const servers = await this.database.adapter.listServers();
    
    return Promise.all(
      servers.map(async (server) => {
        const detail = await this.redis.get<any>(`server:${server.id}:probe`);
        return {
          ...server,
          detail: detail || null,
        };
      }),
    );
  }

  async getServer(id: number): Promise<DfServer & { detail?: any }> {
    const server = await this.database.adapter.getServer(id);

    if (!server) {
      throw new NotFoundException(`Server ${id} not found`);
    }

    const detail = await this.redis.get<any>(`server:${id}:probe`);
    return {
      ...server,
      detail: detail || null,
    };
  }

  async createServer(
    input: CreateServerDto,
    appKey: string | undefined,
  ): Promise<DfServer> {
    this.verifyAppKey(appKey);

    const address = this.normalizeAddress(input.address);

    return this.database.adapter.createServer({
      address,
      version: this.normalizeVersion(input.version),
      token: this.normalizeOptionalText(input.token),
    });
  }

  async probeAll(): Promise<ProbeResult[]> {
    const servers = await this.database.adapter.listProbeServers();
    return Promise.all(servers.map((server) => this.probeServer(server)));
  }

  async probeOne(id: number): Promise<ProbeResult> {
    const server = await this.getServer(id);
    return this.probeServer(server);
  }

  async getProbeResult(id: number): Promise<any> {
    const cached = await this.redis.get<any>(`server:${id}:probe`);

    if (!cached) {
      throw new NotFoundException(`Cache data for server ${id} not found`);
    }

    return cached;
  }

  private async probeServer(server: DfServer): Promise<ProbeResult> {
    const startedAt = performance.now();
    const checkedAt = new Date().toISOString();

    try {
      const scanner = this.scannerRegistry.get(server.version);
      const scan = await scanner.scan(server, {
        httpGet: (url) => this.httpGet(url),
        waitForWebSocketJson: (url, predicate, timeoutMs) =>
          this.waitForWebSocketJson(url, predicate, timeoutMs),
      });

      const alive = scan.websocketMatched ? 1 : 0;
      
      let displayData = scan.websocketData;
      if (scan.websocketData && server.version === 'ray') {
        try {
          displayData = convertRayData(scan.websocketData);
        } catch {
          // If conversion fails, keep raw data
        }
      }

      const result: ProbeResult = {
        id: server.id,
        address: server.address,
        alive,
        scanMode: scan.scanMode,
        latencyMs: Math.round(performance.now() - startedAt),
        statusCode: scan.statusCode,
        version: scan.version,
        httpMatched: scan.httpMatched,
        websocketMatched: scan.websocketMatched,
        websocketData: displayData,
        error: null,
        checkedAt,
      };

      await this.database.adapter.updateServerProbe(server.id, {
        alive,
        version: scan.version,
      });

      if (displayData) {
        const redisKey = `server:${server.id}:probe`;
        const allKeys = await this.redis.keys();
        for (const key of allKeys) {
          await this.redis.del(key);
        }
        await this.redis.set(redisKey, displayData, 1800);
      }

      return result;
    } catch (error) {
      const result: ProbeResult = {
        id: server.id,
        address: server.address,
        alive: -1,
        scanMode: this.safeScanMode(server),
        latencyMs: null,
        statusCode: null,
        version: null,
        httpMatched: false,
        websocketMatched: false,
        websocketData: null,
        error: error instanceof Error ? error.message : String(error),
        checkedAt,
      };

      await this.database.adapter.updateServerProbe(server.id, {
        alive: -1,
      });

      return result;
    }
  }

  private httpGet(url: URL): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 5000);

      const request = client(
        url,
        {
          method: 'GET',
          timeout: timeoutMs,
          headers: {
            'user-agent': 'deltaforce-probe/1.0',
          },
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;
          const chunks: Buffer[] = [];

          response.on('data', (chunk: Buffer | string) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });
          response.once('error', reject);
          response.once('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');

            if (statusCode >= 200 && statusCode < 500) {
              resolve({ statusCode, body });
              return;
            }

            reject(new Error(`HTTP ${statusCode}`));
          });
        },
      );

      request.once('timeout', () => {
        request.destroy(new Error(`Probe timed out after ${timeoutMs}ms`));
      });
      request.once('error', reject);
      request.end();
    });
  }

  private waitForWebSocketJson(
    url: URL,
    predicate: (data: unknown) => boolean,
    timeoutMs: number,
  ): Promise<any | null> {
    return new Promise((resolve, reject) => {
      let completed = false;
      const websocket = new WebSocket(url, {
        headers: {
          'user-agent': 'deltaforce-probe/1.0',
        },
      });
      const timeout = setTimeout(() => {
        console.log(`[WS Debug] Timeout reached after ${timeoutMs}ms without matching data`);
        finish(null);
      }, timeoutMs);

      const finish = (matchedData: any | null) => {
        if (completed) {
          return;
        }

        completed = true;
        clearTimeout(timeout);
        websocket.close();
        resolve(matchedData);
      };

      websocket.once('error', (error) => {
        if (completed) {
          return;
        }
        console.log(`[WS Debug] Error connecting to ${url}: ${error.message}`);

        completed = true;
        clearTimeout(timeout);
        reject(error);
      });
      websocket.once('unexpectedResponse', (_req, res) => {
        if (completed) return;
        const statusCode = res.statusCode ?? 0;
        console.log(`[WS Debug] Unexpected response ${statusCode} from ${url}`);
        completed = true;
        clearTimeout(timeout);
        const err: any = new Error(`WebSocket unexpected response: ${statusCode}`);
        err.statusCode = statusCode;
        reject(err);
      });
      websocket.once('upgrade', () => {
        console.log(`[WS Debug] WebSocket upgraded successfully to ${url}`);
      });
      websocket.on('message', (data) => {
        if (completed) return;

        try {
          let parsed: any = null;
          let messageType = 'text';

          if (Buffer.isBuffer(data)) {
            // 1. Try to decompress first (zlib/gzip)
            let decompressed: Buffer | null = null;
            try {
              decompressed = inflateSync(data);
              console.log(`[WS Debug] Successfully decompressed zlib message`);
            } catch {
              try {
                decompressed = gunzipSync(data);
                console.log(`[WS Debug] Successfully decompressed gzip message`);
              } catch {
                decompressed = null;
              }
            }

            const targetBuffer = decompressed || data;
            const wasCompressed = !!decompressed;
            
            // 2. Try JSON parse
            try {
              const text = targetBuffer.toString('utf8');
              parsed = JSON.parse(text);
              messageType = wasCompressed ? 'compressed-json' : 'json';
            } catch {
              // 3. Try MsgPack decode
              try {
                parsed = msg_decode(targetBuffer);
                messageType = wasCompressed ? 'compressed-msgpack' : 'msgpack';
                console.log(`[WS Debug] Successfully decoded msgpack message from ${wasCompressed ? 'decompressed buffer' : 'original buffer'}`);
              } catch {
                console.log(`[WS Debug] Failed to parse Buffer as JSON or MsgPack`);
              }
            }
          } else {
            // String data
            try {
              parsed = JSON.parse(data.toString());
              messageType = 'json';
            } catch {
              console.log(`[WS Debug] Failed to parse string as JSON`);
            }
          }

          if (parsed) {
            const summary = typeof parsed === 'object' && parsed !== null 
              ? JSON.stringify(parsed).substring(0, 100) 
              : String(parsed);
            
            const isMatch = predicate(parsed);
            console.log(`[WS Debug] Received ${messageType} message: ${summary}...`);

            if (isMatch) {
              console.log(`[WS Debug] Predicate matched (found m+seq)! Data captured and completed.`);
              finish(parsed);
            } else {
              console.log(`[WS Debug] Ignoring non-core message (type: ${parsed.type || 'unknown'}). Still waiting for the compressed game data...`);
            }
          }
        } catch (e) {
          console.log(`[WS Debug] Failed to process message: ${e.message}`);
        }
      });
      websocket.once('close', () => {
        console.log(`[WS Debug] WebSocket closed by server`);
        finish(null);
      });
    });
  }

  private normalizeUrl(address: string): URL {
    if (/^https?:\/\//i.test(address)) {
      return new URL(address);
    }

    return new URL(`http://${address}`);
  }

  private normalizeAddress(address: string): string {
    if (typeof address !== 'string' || !address.trim()) {
      throw new BadRequestException('address is required');
    }

    const trimmed = address.trim();

    try {
      this.normalizeUrl(trimmed);
    } catch {
      throw new BadRequestException('address must be a valid URL or host');
    }

    if (trimmed.length > 255) {
      throw new BadRequestException('address must be 255 characters or less');
    }

    return trimmed;
  }

  private normalizeVersion(version: string | null | undefined): string {
    const normalized = this.normalizeRequiredText(
      version,
      'version',
    ).toLowerCase();

    if (normalized !== 'ray') {
      throw new BadRequestException('version must be ray');
    }

    return normalized;
  }

  private safeScanMode(server: DfServer): string {
    try {
      return `${this.scannerRegistry.get(server.version).version}:http+websocket`;
    } catch {
      return `unsupported:${server.version ?? 'null'}`;
    }
  }

  private verifyAppKey(authorization: string | undefined): void {
    const expectedAppKey = process.env.APP_KEY;

    if (!expectedAppKey) {
      throw new ForbiddenException('未设置密钥无法添加');
    }

    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : authorization;

    if (!token || !this.safeEquals(token, expectedAppKey)) {
      throw new UnauthorizedException('Invalid app key');
    }
  }

  private safeEquals(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private normalizeOptionalText(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    fieldName: string,
  ): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const trimmed = value.trim();

    if (trimmed.length > 255) {
      throw new BadRequestException(
        `${fieldName} must be 255 characters or less`,
      );
    }

    return trimmed;
  }
}
