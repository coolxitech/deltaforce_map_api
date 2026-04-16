import 'dotenv/config';
import { HttpException } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { RedisService } from './database/redis/redis.service';
import { ProbeResult } from './probes/probe.types';
import { ProbesService } from './probes/probes.service';

interface ScanOptions {
  id?: number;
  json: boolean;
  help: boolean;
}

interface ScanSummary {
  total: number;
  alive: number;
  failed: number;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const database = new DatabaseService();
  const redis = new RedisService();
  const probes = new ProbesService(database, redis);

  try {
    const results = options.id
      ? [await probes.probeOne(options.id)]
      : await probes.probeAll();

    printResults(results, options.json);
  } finally {
    await database.onModuleDestroy();
    await redis.onModuleDestroy();
  }
}

function parseArgs(args: string[]): ScanOptions {
  const options: ScanOptions = {
    json: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--id' || arg === '-i') {
      const value = args[index + 1];
      options.id = parseId(value);
      index += 1;
      continue;
    }

    if (/^\d+$/.test(arg)) {
      options.id = parseId(arg);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseId(value: string | undefined): number {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Server id must be a positive integer');
  }

  return id;
}

function printResults(results: ProbeResult[], json: boolean) {
  const summary = summarize(results);

  if (json) {
    console.log(
      JSON.stringify(
        {
          code: 0,
          msg: 'success',
          data: {
            summary,
            results,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `Scan complete: total=${summary.total}, alive=${summary.alive}, failed=${summary.failed}`,
  );

  for (const result of results) {
    const status = result.alive === 1 ? 'alive' : 'failed';
    const latency = result.latencyMs === null ? '-' : `${result.latencyMs}ms`;
    const statusCode = result.statusCode === null ? '-' : result.statusCode;
    const error = result.error ? ` error="${result.error}"` : '';

    const wsData = result.websocketData
      ? ` wsData=${JSON.stringify(result.websocketData)}`
      : '';

    console.log(
      `[${status}] id=${result.id} address=${result.address} scanMode=${result.scanMode} latency=${latency} statusCode=${statusCode}${wsData}${error}`,
    );
  }
}

function summarize(results: ProbeResult[]): ScanSummary {
  return {
    total: results.length,
    alive: results.filter((result) => result.alive === 1).length,
    failed: results.filter((result) => result.alive === -1).length,
  };
}

function printHelp() {
  console.log(`Usage:
  pnpm run scan                 Scan all servers with alive != -1
  pnpm run scan -- --id 12      Scan one server
  pnpm run scan -- 12           Scan one server
  pnpm run scan -- --json       Print JSON output

Environment:
  DB_DRIVER=mysql|postgres|mongodb
  DB_HOST=...
  DB_PORT=...
  DB_NAME=...
  DB_USER=...
  DB_PASSWORD=...
  PROBE_TIMEOUT_MS=5000
  RAY_HTTP_PATH=/
  RAY_WEBSOCKET_PATH=/web
  RAY_WEBSOCKET_TIMEOUT_MS=7000`);
}

void main().catch((error) => {
  if (error instanceof HttpException) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
});
