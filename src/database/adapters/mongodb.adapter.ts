import { Collection, MongoClient } from 'mongodb';
import { DatabaseConfig } from '../database.config';
import {
  DatabaseAdapter,
  CreateDfServerInput,
  DfConfig,
  DfServer,
  AliveStatus,
  InstallResult,
  SchemaCheckResult,
} from '../database.types';

interface DfServerDocument {
  id: number;
  address: string;
  alive: number | boolean;
  version?: string | null;
  token?: string | null;
}

export class MongodbAdapter implements DatabaseAdapter {
  private readonly client: MongoClient;
  private readonly databaseName: string;

  constructor(config: DatabaseConfig) {
    const uri =
      config.uri ??
      `mongodb://${encodeURIComponent(config.username)}:${encodeURIComponent(
        config.password,
      )}@${config.host}:${config.port}/${config.database}`;

    this.client = new MongoClient(uri);
    this.databaseName = config.database;
  }

  async install(): Promise<InstallResult> {
    const before = await this.checkSchema();
    const actions: string[] = [];
    const db = await this.db();
    await db.createCollection('df_config').catch(ignoreNamespaceExists);
    await db.createCollection('df_list').catch(ignoreNamespaceExists);
    actions.push('Ensured collection df_config exists');
    actions.push('Ensured collection df_list exists');

    await this.configCollection().createIndex({ name: 1 }, { unique: true });
    await this.serverCollection().createIndex(
      { id: 1, address: 1 },
      { unique: true },
    );
    actions.push('Ensured index df_config.name exists');
    actions.push('Ensured index df_list.id_address exists');

    const after = await this.checkSchema();

    return { before, actions, after };
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  async listConfig(): Promise<DfConfig[]> {
    const rows = await this.configCollection()
      .find({}, { projection: { _id: 0, name: 1, value: 1 } })
      .sort({ name: 1 })
      .toArray();
    return rows as DfConfig[];
  }

  async getConfig(name: string): Promise<DfConfig | null> {
    return this.configCollection().findOne(
      { name },
      { projection: { _id: 0, name: 1, value: 1 } },
    ) as Promise<DfConfig | null>;
  }

  async listServers(): Promise<DfServer[]> {
    const rows = await this.serverCollection()
      .find({ alive: 1 }, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
    return rows.map((row) => this.mapServer(row));
  }

  async listProbeServers(): Promise<DfServer[]> {
    const rows = await this.serverCollection()
      .find({ alive: { $gte: 0 } }, { projection: { _id: 0 } })
      .sort({ id: 1 })
      .toArray();
    return rows.map((row) => this.mapServer(row));
  }

  async getServer(id: number): Promise<DfServer | null> {
    const row = await this.serverCollection().findOne(
      { id, alive: { $gte: 0 } },
      { projection: { _id: 0 } },
    );
    return row ? this.mapServer(row) : null;
  }

  async createServer(input: CreateDfServerInput): Promise<DfServer> {
    const id = await this.nextServerId();
    const server: DfServerDocument = {
      id,
      address: input.address,
      alive: 0,
      version: input.version ?? null,
      token: input.token ?? null,
    };

    await this.serverCollection().insertOne(server);

    return this.mapServer(server);
  }

  async updateServerProbe(
    id: number,
    input: { alive: AliveStatus; version?: string | null },
  ): Promise<void> {
    await this.serverCollection().updateOne(
      { id },
      {
        $set: {
          alive: input.alive,
          ...(input.version ? { version: input.version } : {}),
        },
      },
    );
  }

  private async db() {
    await this.client.connect();
    return this.client.db(this.databaseName);
  }

  private configCollection(): Collection<DfConfig> {
    return this.client.db(this.databaseName).collection<DfConfig>('df_config');
  }

  private serverCollection(): Collection<DfServerDocument> {
    return this.client
      .db(this.databaseName)
      .collection<DfServerDocument>('df_list');
  }

  private async nextServerId(): Promise<number> {
    const latest = await this.serverCollection().findOne(
      {},
      {
        projection: { id: 1 },
        sort: { id: -1 },
      },
    );

    return (latest?.id ?? 0) + 1;
  }

  private mapServer(row: DfServerDocument): DfServer {
    return {
      id: row.id,
      address: row.address,
      alive: normalizeAlive(row.alive),
      version: row.version ?? null,
      token: row.token ?? null,
    };
  }

  private async checkSchema(): Promise<SchemaCheckResult> {
    const db = await this.db();
    const issues: string[] = [];
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();
    const collectionNames = new Set(
      collections.map((collection) => collection.name),
    );

    for (const collectionName of ['df_config', 'df_list']) {
      if (!collectionNames.has(collectionName)) {
        issues.push(`Missing collection: ${collectionName}`);
      }
    }

    if (collectionNames.has('df_config')) {
      const indexes = await this.configCollection().indexes();
      if (!hasUniqueIndex(indexes, ['name'])) {
        issues.push('Missing unique index: df_config(name)');
      }
    }

    if (collectionNames.has('df_list')) {
      const indexes = await this.serverCollection().indexes();
      if (!hasUniqueIndex(indexes, ['id', 'address'])) {
        issues.push('Missing unique index: df_list(id, address)');
      }
    }

    return { ok: issues.length === 0, issues };
  }
}

function ignoreNamespaceExists(error: Error & { codeName?: string }) {
  if (error.codeName !== 'NamespaceExists') {
    throw error;
  }
}

function hasUniqueIndex(
  indexes: { key: Record<string, unknown>; unique?: boolean }[],
  keys: string[],
): boolean {
  return indexes.some((index) => {
    if (!index.unique) {
      return false;
    }

    const indexKeys = Object.keys(index.key);
    return (
      indexKeys.length === keys.length &&
      indexKeys.every((key, indexPosition) => key === keys[indexPosition])
    );
  });
}

function normalizeAlive(value: number | boolean): AliveStatus {
  if (value === true || value === 1) {
    return 1;
  }

  if (value === -1) {
    return -1;
  }

  return 0;
}
