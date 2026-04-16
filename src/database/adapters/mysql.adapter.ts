import { createPool, Pool } from 'mysql2/promise';
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
  id: number;
  address: string;
  alive: number;
  version: string | null;
  token: string | null;
}

export class MysqlAdapter implements DatabaseAdapter {
  private readonly pool: Pool;
  private readonly database: string;

  constructor(config: DatabaseConfig) {
    this.pool = createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
      charset: 'utf8mb4',
    });
    this.database = config.database;
  }

  async install(): Promise<InstallResult> {
    const before = await this.checkSchema();
    const actions: string[] = [];

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_config (
        name varchar(255) NOT NULL COMMENT '键',
        value text NULL COMMENT '值',
        PRIMARY KEY (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS df_list (
        id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'ID',
        address varchar(255) NOT NULL COMMENT 'url地址',
        alive tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否存活',
        version varchar(255) NULL COMMENT '版本',
        token text NULL COMMENT 'Token',
        PRIMARY KEY (id, address)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci ROW_FORMAT=DYNAMIC
    `);
    actions.push('Ensured table df_config exists');
    actions.push('Ensured table df_list exists');

    actions.push(
      ...(await this.ensureColumns('df_config', MYSQL_TABLES.df_config)),
    );
    actions.push(
      ...(await this.ensureColumns('df_list', MYSQL_TABLES.df_list)),
    );

    const after = await this.checkSchema();

    return { before, actions, after };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listConfig(): Promise<DfConfig[]> {
    const [rows] = await this.pool.query(
      'SELECT name, value FROM df_config ORDER BY name ASC',
    );
    return rows as DfConfig[];
  }

  async getConfig(name: string): Promise<DfConfig | null> {
    const [rows] = await this.pool.query(
      'SELECT name, value FROM df_config WHERE name = ? LIMIT 1',
      [name],
    );
    return (rows as DfConfig[])[0] ?? null;
  }

  async listServers(): Promise<DfServer[]> {
    const [rows] = await this.pool.query(
      'SELECT id, address, alive, version, token FROM df_list WHERE alive = 1 ORDER BY id ASC',
    );
    return (rows as DfServerRow[]).map((row) => this.mapServer(row));
  }

  async listProbeServers(): Promise<DfServer[]> {
    const [rows] = await this.pool.query(
      'SELECT id, address, alive, version, token FROM df_list WHERE alive <> -1 ORDER BY id ASC',
    );
    return (rows as DfServerRow[]).map((row) => this.mapServer(row));
  }

  async getServer(id: number): Promise<DfServer | null> {
    const [rows] = await this.pool.query(
      'SELECT id, address, alive, version, token FROM df_list WHERE id = ? AND alive <> -1 LIMIT 1',
      [id],
    );
    const row = (rows as DfServerRow[])[0];
    return row ? this.mapServer(row) : null;
  }

  async createServer(input: CreateDfServerInput): Promise<DfServer> {
    const [result] = await this.pool.query(
      `
      INSERT INTO df_list (address, alive, version, token)
      VALUES (?, 0, ?, ?)
    `,
      [input.address, input.version ?? null, input.token ?? null],
    );
    const insertId = Number((result as { insertId: number }).insertId);

    const server = await this.getServer(insertId);

    if (!server) {
      throw new Error(`Created server ${insertId} could not be loaded`);
    }

    return server;
  }

  async updateServerProbe(
    id: number,
    input: { alive: AliveStatus; version?: string | null },
  ): Promise<void> {
    await this.pool.query(
      'UPDATE df_list SET alive = ?, version = COALESCE(?, version) WHERE id = ?',
      [input.alive, input.version ?? null, id],
    );
  }

  private mapServer(row: DfServerRow): DfServer {
    return {
      ...row,
      alive: normalizeAlive(row.alive),
    };
  }

  private async checkSchema(): Promise<SchemaCheckResult> {
    const issues: string[] = [];

    for (const [tableName, columns] of Object.entries(MYSQL_TABLES)) {
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
      const expectedPrimaryKey = MYSQL_PRIMARY_KEYS[tableName] ?? [];

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
        `ALTER TABLE \`${tableName}\` ADD COLUMN ${column.sql}`,
      );
      actions.push(`Added column ${tableName}.${column.name}`);
    }

    return actions;
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const [rows] = await this.pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ?
      LIMIT 1
    `,
      [this.database, tableName],
    );

    return (rows as unknown[]).length > 0;
  }

  private async getColumns(
    tableName: string,
  ): Promise<Map<string, { dataType: string; nullable: boolean }>> {
    const [rows] = await this.pool.query(
      `
      SELECT column_name, column_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
    `,
      [this.database, tableName],
    );

    return new Map(
      (
        rows as {
          column_name: string;
          column_type: string;
          is_nullable: 'YES' | 'NO';
        }[]
      ).map((row) => [
        row.column_name,
        {
          dataType: row.column_type.toLowerCase(),
          nullable: row.is_nullable === 'YES',
        },
      ]),
    );
  }

  private async getPrimaryKeyColumns(tableName: string): Promise<string[]> {
    const [rows] = await this.pool.query(
      `
      SELECT column_name
      FROM information_schema.key_column_usage
      WHERE table_schema = ?
        AND table_name = ?
        AND constraint_name = 'PRIMARY'
      ORDER BY ordinal_position ASC
    `,
      [this.database, tableName],
    );

    return (rows as { column_name: string }[]).map((row) => row.column_name);
  }
}

const MYSQL_TABLES: Record<string, ColumnDefinition[]> = {
  df_config: [
    {
      name: 'name',
      sql: "`name` varchar(255) NOT NULL COMMENT '键'",
      dataType: 'varchar(255)',
      nullable: false,
    },
    {
      name: 'value',
      sql: "`value` text NULL COMMENT '值'",
      dataType: 'text',
      nullable: true,
    },
  ],
  df_list: [
    {
      name: 'id',
      sql: "`id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'ID'",
      dataType: 'bigint unsigned',
      nullable: false,
    },
    {
      name: 'address',
      sql: "`address` varchar(255) NOT NULL COMMENT 'url地址'",
      dataType: 'varchar(255)',
      nullable: false,
    },
    {
      name: 'alive',
      sql: "`alive` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否存活'",
      dataType: 'tinyint(1)',
      nullable: false,
    },
    {
      name: 'version',
      sql: "`version` varchar(255) NULL COMMENT '版本'",
      dataType: 'varchar(255)',
      nullable: true,
    },
    {
      name: 'token',
      sql: "`token` text NULL COMMENT 'Token'",
      dataType: 'text',
      nullable: true,
    },
  ],
};

const MYSQL_PRIMARY_KEYS: Record<string, string[]> = {
  df_config: ['name'],
  df_list: ['id', 'address'],
};

function normalizeAlive(value: number): AliveStatus {
  if (value === -1 || value === 1) {
    return value;
  }

  return 0;
}
