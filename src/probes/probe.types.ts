import { AliveStatus } from '../database/database.types';

export interface ProbeResult {
  id: number;
  address: string;
  alive: AliveStatus;
  scanMode: string;
  latencyMs: number | null;
  statusCode: number | null;
  version: string | null;
  httpMatched: boolean;
  websocketMatched: boolean;
  websocketData: unknown;
  error: string | null;
  checkedAt: string;
}
