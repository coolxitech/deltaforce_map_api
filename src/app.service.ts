import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      status: 'ok',
      service: 'deltaforce_cheat_api',
      timestamp: new Date().toISOString(),
    };
  }
}
