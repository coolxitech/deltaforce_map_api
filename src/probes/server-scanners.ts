import { DfServer } from '../database/database.types';
import { websocketConnectedMessageGuards } from '../interface';

export interface HttpResponse {
  statusCode: number;
  body: string;
}

export interface ScannerContext {
  httpGet(url: URL): Promise<HttpResponse>;
  waitForWebSocketJson(
    url: URL,
    predicate: (data: unknown) => boolean,
    timeoutMs: number,
  ): Promise<unknown>;
}

export interface ScannerProbeResult {
  scanMode: string;
  statusCode: number | null;
  version: string;
  httpMatched: boolean;
  websocketMatched: boolean;
  websocketData: unknown;
}

export interface ServerScanner {
  readonly version: string;
  scan(server: DfServer, context: ScannerContext): Promise<ScannerProbeResult>;
}

export class ServerScannerRegistry {
  private readonly scanners = new Map<string, ServerScanner>();

  constructor() {
    this.register(new RayServerScanner());
  }

  get(version: string | null): ServerScanner {
    const normalizedVersion = normalizeVersion(version);
    const scanner = this.scanners.get(normalizedVersion);

    if (!scanner) {
      throw new Error(`Unsupported server version: ${version ?? 'null'}`);
    }

    return scanner;
  }

  private register(scanner: ServerScanner) {
    this.scanners.set(scanner.version, scanner);
  }
}

class RayServerScanner implements ServerScanner {
  readonly version = 'ray';
  private readonly httpPath = normalizePath('/');
  private readonly websocketPath = normalizePath('/web');
  private readonly websocketTimeoutMs = 7000;

  async scan(
    server: DfServer,
    context: ScannerContext,
  ): Promise<ScannerProbeResult> {
    const httpResponse = await context.httpGet(this.resolveHttpUrl(server));

    if (httpResponse.statusCode !== 200) {
      throw new Error(
        `ray HTTP probe returned non-200 status: ${httpResponse.statusCode}`,
      );
    }

    const httpMatched = isRayHtml(httpResponse.body);

    if (!httpMatched) {
      throw new Error('ray HTTP probe did not match expected page markers');
    }

    let websocketMatched = false;
    let websocketData: unknown = null;
    try {
      websocketData = await context.waitForWebSocketJson(
        this.resolveWebSocketUrl(server),
        websocketConnectedMessageGuards.ray,
        this.websocketTimeoutMs,
      );
      websocketMatched = websocketData !== null;
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'statusCode' in err &&
        (err as { statusCode: unknown }).statusCode === 401
      ) {
        // Retry with password query parameter
        try {
          const urlWithPassword = this.resolveWebSocketUrl(server);
          urlWithPassword.searchParams.set('password', '12345678');
          websocketData = await context.waitForWebSocketJson(
            urlWithPassword,
            websocketConnectedMessageGuards.ray,
            this.websocketTimeoutMs,
          );
          websocketMatched = websocketData !== null;
        } catch {
          websocketMatched = false;
        }
      } else {
        // If WebSocket fails (connection error, etc.) but HTTP passed, we just mark it as not matched.
        websocketMatched = false;
      }
    }

    return {
      scanMode: 'ray:http+websocket',
      statusCode: httpResponse.statusCode,
      version: this.version,
      httpMatched,
      websocketMatched,
      websocketData,
    };
  }

  private resolveHttpUrl(server: DfServer): URL {
    const url = normalizeUrl(server.address);
    url.pathname = joinPath(url.pathname, this.httpPath);
    return url;
  }

  private resolveWebSocketUrl(server: DfServer): URL {
    const url = normalizeUrl(server.address);
    url.protocol = 'ws:';
    url.pathname = joinPath(url.pathname, this.websocketPath);
    return url;
  }
}

function normalizeVersion(version: string | null): string {
  return (version ?? '').trim().toLowerCase();
}

function normalizeUrl(address: string): URL {
  if (/^https?:\/\//i.test(address)) {
    return new URL(address);
  }

  return new URL(`http://${address}`);
}

function normalizePath(path: string): string {
  if (!path.trim()) {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function joinPath(basePath: string, scannerPath: string): string {
  if (scannerPath === '/') {
    return basePath || '/';
  }

  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/$/, '');
  return `${normalizedBase}${scannerPath}`;
}

function isRayHtml(html: string): boolean {
  return html.includes('RAY DELTA') || html.includes('RAY-DELTA');
}
