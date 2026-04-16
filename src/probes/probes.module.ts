import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProbesController } from './probes.controller';
import { ProbesService } from './probes.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ProbesController],
  providers: [ProbesService],
})
export class ProbesModule {}
