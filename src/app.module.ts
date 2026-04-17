import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ProbesModule } from './probes/probes.module';

@Module({
  imports: [DatabaseModule, ProbesModule],
})
export class AppModule {}
