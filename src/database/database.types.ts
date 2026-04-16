export interface DfConfig {
  name: string;
  value: string | null;
}

export type AliveStatus = -1 | 0 | 1;

export interface DfServer {
  id: number;
  address: string;
  alive: AliveStatus;
  version: string | null;
  token: string | null;
}

export interface CreateDfServerInput {
  address: string;
  version: string;
  token?: string | null;
}

export interface SchemaCheckResult {
  ok: boolean;
  issues: string[];
}

export interface InstallResult {
  before: SchemaCheckResult;
  actions: string[];
  after: SchemaCheckResult;
}

export interface DatabaseAdapter {
  install(): Promise<InstallResult>;
  close(): Promise<void>;
  listConfig(): Promise<DfConfig[]>;
  getConfig(name: string): Promise<DfConfig | null>;
  listServers(): Promise<DfServer[]>;
  listProbeServers(): Promise<DfServer[]>;
  getServer(id: number): Promise<DfServer | null>;
  createServer(input: CreateDfServerInput): Promise<DfServer>;
  updateServerProbe(
    id: number,
    input: { alive: AliveStatus; version?: string | null },
  ): Promise<void>;
}
