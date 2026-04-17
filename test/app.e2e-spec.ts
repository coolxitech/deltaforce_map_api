import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/configure-app';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/database/redis/redis.service';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({ adapter: {} })
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/missing-route (GET) should wrap errors', () => {
    return request(app.getHttpServer())
      .get('/missing-route')
      .expect(404)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 404,
          msg: 'Cannot GET /missing-route',
          data: null,
        });
      });
  });

  it('does not expose HTTP probe triggers', async () => {
    await request(app.getHttpServer()).post('/server-probes').expect(404);
    await request(app.getHttpServer()).post('/servers/1/probes').expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
