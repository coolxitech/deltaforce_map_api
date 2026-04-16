import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MysqlAdapter } from './adapters/mysql.adapter';
import { MongodbAdapter } from './adapters/mongodb.adapter';
import { PostgresAdapter } from './adapters/postgres.adapter';
import { getDatabaseConfig } from './database.config';
import { DatabaseAdapter } from './database.types';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly adapter: DatabaseAdapter;

  constructor() {
    const config = getDatabaseConfig();

    if (config.driver === 'postgres') {
      this.adapter = new PostgresAdapter(config);
      return;
    }

    if (config.driver === 'mongodb') {
      this.adapter = new MongodbAdapter(config);
      return;
    }

    this.adapter = new MysqlAdapter(config);
  }

  async onModuleDestroy(): Promise<void> {
    await this.adapter.close();
  }
}
