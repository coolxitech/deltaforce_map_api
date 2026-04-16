import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ProbesService } from './probes.service';
import type { CreateServerDto } from './server.dto';

@Controller()
export class ProbesController {
  constructor(private readonly probesService: ProbesService) {}

  @Get('servers')
  listServers() {
    return this.probesService.listServers();
  }

  @Get('servers/:id')
  getServer(@Param('id', ParseIntPipe) id: number) {
    return this.probesService.getServer(id);
  }

  @Post('servers')
  createServer(
    @Body() body: CreateServerDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.probesService.createServer(body, authorization);
  }

  @Post('server-probes')
  probeAll() {
    return this.probesService.probeAll();
  }

  @Post('servers/:id/probes')
  probeOne(@Param('id', ParseIntPipe) id: number) {
    return this.probesService.probeOne(id);
  }

  @Get('servers/:id/probe')
  getProbeResult(@Param('id', ParseIntPipe) id: number) {
    return this.probesService.getProbeResult(id);
  }
}
