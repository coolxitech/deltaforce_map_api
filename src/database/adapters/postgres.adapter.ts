import { Pool } from 'pg';
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

interface ColumnDefinition {
  name: string;
  sql: string;
  dataType: string;
  nullable: boolean;
}

interface DfServerRow {
  id: string | number;
  address: string;
  alive: boolean | number;
  version: string | null;
  token: string | null;
}

export class PostgresAdapter implements DatabaseAdapter {
  private readonly pool: Pool;

  constructor(config: DatabaseConfig) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: Number(process.env.DB_POOL_LIMIT ?? 10),
    });
  }

  async install(): Promise<InstallResult> {
    const before = await this.checkSchema();
    const actions: string[] = [];

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_config (
        name varchar(255) PRIMARY KEY,
        value text
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_list (
        id bigserial NOT NULL,
        address varchar(255) NOT NULL,
        alive smallint NOT NULL DEFAULT 0,
        version varchar(255),
        token text,
        PRIMARY KEY (id, address)
      )
    `);
    actions.push('Ensured table df_config exists');
    actions.push('Ensured table df_list exists');

    actions.push(
      ...(await this.ensureColumns('df_config', POSTGRES_TABLES.df_config)),
    );
    actions.push(
      ...(await this.ensureColumns('df_list', POSTGRES_TABLES.df_list)),
    );

    const after = await this.checkSchema();

    return { before, actions, after };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listConfig(): Promise<DfConfig[]> {
    const result = await this.pool.query<DfConfig>(
      'SELECT name, value FROM df_config ORDER BY name ASC',
    );
    return result.rows;
  }

  async getConfig(name: string): Promise<DfConfig | null> {
    const result = await this.pool.query<DfConfig>(
      'SELECT name, value FROM df_config WHERE name = $1 LIMIT 1',
      [name],
    );
    return result.rows[0] ?? null;
  }

  async listServers(): Promise<DfServer[]> {
    const result = await this.pool.query<DfServerRow>(
      'SELECT id, address, alive, version, token FROM df_list WHERE alive = 1 ORDER BY id ASC',
    );
    return result.rows.map((row) => this.mapServer(row));
  }

  async listProbeServers(): Promise<DfServer[]> {
    const result = await this.pool.query<DfServerRow>(
      'SELECT id, address, alive, version, token FROM df_list WHERE alive <> -1 ORDER BY id ASC',
    );
    return result.rows.map((row) => this.mapServer(row));
  }

  async getServer(id: number): Promise<DfServer | null> {
    const result = await this.pool.query<DfServerRow>(
      'SELECT id, address, alive, version, token FROM df_list WHERE id = $1 AND alive <> -1 LIMIT 1',
      [id],
    );
    const row = result.rows[0];
    return row ? this.mapServer(row) : null;
  }

  async createServer(input: CreateDfServerInput): Promise<DfServer> {
    const result = await this.pool.query<DfServerRow>(
      `
      INSERT INTO df_list (address, alive, version, token)
      VALUES ($1, 0, $2, $3)
      RETURNING id, address, alive, version, token
    `,
      [input.address, input.version ?? null, input.token ?? null],
    );

    return this.mapServer(result.rows[0]);
  }

  async updateServerProbe(
    id: number,
    input: { alive: AliveStatus; version?: string | null },
  ): Promise<void> {
    await this.pool.query(
      'UPDATE df_list SET alive = $1, version = COALESCE($2, version) WHERE id = $3',
      [input.alive, input.version ?? null, id],
    );
  }

  private mapServer(row: DfServerRow): DfServer {
    return {
      ...row,
      id: Number(row.id),
      alive: normalizeAlive(row.alive),
    };
  }

  private async checkSchema(): Promise<SchemaCheckResult> {
    const issues: string[] = [];

    for (const [tableName, columns] of Object.entries(POSTGRES_TABLES)) {
      if (!(await this.tableExists(tableName))) {
        issues.push(`Missing table: ${tableName}`);
        continue;
      }

      const existingColumns = await this.getColumns(tableName);

      for (const column of columns) {
        const existing = existingColumns.get(column.name);

        if (!existing) {
          issues.push(`Missing column: ${tableName}.${column.name}`);
          continue;
        }

        if (existing.dataType !== column.dataType) {
          issues.push(
            `Column type mismatch: ${tableName}.${column.name} expected ${column.dataType}, got ${existing.dataType}`,
          );
        }

        if (existing.nullable !== column.nullable) {
          issues.push(
            `Column nullable mismatch: ${tableName}.${column.name} expected ${column.nullable ? 'NULL' : 'NOT NULL'}`,
          );
        }
      }

      const primaryKey = await this.getPrimaryKeyColumns(tableName);
      const expectedPrimaryKey = POSTGRES_PRIMARY_KEYS[tableName] ?? [];

      if (primaryKey.join(',') !== expectedPrimaryKey.join(',')) {
        issues.push(
          `Primary key mismatch: ${tableName} expected (${expectedPrimaryKey.join(', ')}), got (${primaryKey.join(', ') || 'none'})`,
        );
      }
    }

    return { ok: issues.length === 0, issues };
  }

  private async ensureColumns(
    tableName: string,
    columns: ColumnDefinition[],
  ): Promise<string[]> {
    const actions: string[] = [];
    const existingColumns = await this.getColumns(tableName);

    for (const column of columns) {
      if (existingColumns.has(column.name)) {
        continue;
      }

      await this.pool.query(
        `ALTER TABLE "${tableName}" ADD COLUMN ${column.sql}`,
      );
      actions.push(`Added column ${tableName}.${column.name}`);
    }

    return actions;
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS "exists"
    `,
      [tableName],
    );

    return result.rows[0]?.exists ?? false;
  }

  private async getColumns(
    tableName: string,
  ): Promise<Map<string, { dataType: string; nullable: boolean }>> {
    const result = await this.pool.query<{
      column_name: string;
      data_type: string;
      udt_name: string;
      character_maximum_length: number | null;
      is_nullable: 'YES' | 'NO';
    }>(
      `
      SELECT column_name, data_type, udt_name, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
      [tableName],
    );

    return new Map(
      result.rows.map((row) => [
        row.column_name,
        {
          dataType: normalizePostgresType(row),
          nullable: row.is_nullable === 'YES',
        },
      ]),
    );
  }

  private async getPrimaryKeyColumns(tableName: string): Promise<string[]> {
    const result = await this.pool.query<{ column_name: string }>(
      `
      SELECT a.attname AS column_name
      FROM pg_index i
      JOIN pg_attribute a
        ON a.attrelid = i.indrelid
       AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass
        AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
    `,
      [tableName],
    );

    return result.rows.map((row) => row.column_name);
  }
}

const POSTGRES_TABLES: Record<string, ColumnDefinition[]> = {
  df_config: [
    {
      name: 'name',
      sql: 'name varchar(255) NOT NULL',
      dataType: 'varchar(255)',
      nullable: false,
    },
    {
      name: 'value',
      sql: 'value text',
      dataType: 'text',
      nullable: true,
    },
  ],
  df_list: [
    {
      name: 'id',
      sql: 'id bigserial NOT NULL',
      dataType: 'bigint',
      nullable: false,
    },
    {
      name: 'address',
      sql: 'address varchar(255) NOT NULL',
      dataType: 'varchar(255)',
      nullable: false,
    },
    {
      name: 'alive',
      sql: 'alive smallint NOT NULL DEFAULT 0',
      dataType: 'smallint',
      nullable: false,
    },
    {
      name: 'version',
      sql: 'version varchar(255)',
      dataType: 'varchar(255)',
      nullable: true,
    },
    {
      name: 'token',
      sql: 'token text',
      dataType: 'text',
      nullable: true,
    },
  ],
};

const POSTGRES_PRIMARY_KEYS: Record<string, string[]> = {
  df_config: ['name'],
  df_list: ['id', 'address'],
};

function normalizePostgresType(row: {
  data_type: string;
  udt_name: string;
  character_maximum_length: number | null;
}): string {
  if (row.data_type === 'character varying') {
    return `varchar(${row.character_maximum_length})`;
  }

  if (row.data_type === 'bigint' || row.udt_name === 'int8') {
    return 'bigint';
  }

  return row.data_type;
}

function normalizeAlive(value: boolean | number): AliveStatus {
  if (value === true || value === 1) {
    return 1;
  }

  if (value === -1) {
    return -1;
  }

  return 0;
}
