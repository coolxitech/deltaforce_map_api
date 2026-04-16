export type DatabaseDriver = 'mysql' | 'postgres' | 'mongodb';

export interface DatabaseConfig {
  driver: DatabaseDriver;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  uri?: string;
}

export function getDatabaseConfig(): DatabaseConfig {
  const driver = (process.env.DB_DRIVER ?? 'mysql') as DatabaseDriver;

  if (!['mysql', 'postgres', 'mongodb'].includes(driver)) {
    throw new Error('DB_DRIVER must be mysql, postgres, or mongodb');
  }

  return {
    driver,
    host: process.env.DB_HOST ?? 'mysql.kuxi.tech',
    port: Number(process.env.DB_PORT ?? defaultPort(driver)),
    database: process.env.DB_NAME ?? 'deltaforce',
    username: process.env.DB_USER ?? 'deltaforce',
    password: process.env.DB_PASSWORD ?? '',
    uri: process.env.DB_URI,
  };
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export function getRedisConfig(): RedisConfig {
  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
  };
}

function defaultPort(driver: DatabaseDriver): number {
  if (driver === 'postgres') {
    return 5432;
  }

  if (driver === 'mongodb') {
    return 27017;
  }

  return 3306;
}
