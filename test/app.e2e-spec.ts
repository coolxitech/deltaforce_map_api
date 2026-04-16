import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/configure-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 0,
          msg: 'success',
          data: {
            status: 'ok',
            service: 'deltaforce_cheat_api',
          },
        });
      });
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

  afterEach(async () => {
    await app.close();
  });
});
