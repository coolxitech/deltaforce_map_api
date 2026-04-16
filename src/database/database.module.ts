import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [DatabaseService],
  exports: [DatabaseService, RedisModule],
})
export class DatabaseModule {}
