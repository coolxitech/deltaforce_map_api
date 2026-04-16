import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { ProbesModule } from './probes/probes.module';

@Module({
  imports: [DatabaseModule, ProbesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
