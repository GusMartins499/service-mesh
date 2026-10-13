import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World! - V2"', () => {
      expect(appController.getHello()).toBe('Hello World! - V2');
    });
  });

  describe('healthz', () => {
    it('should return status ok', () => {
      expect(appController.healthz()).toEqual({ status: 'ok' });
    });
  });

  describe('readyz', () => {
    it('should return status ok', () => {
      expect(appController.readyz()).toEqual({ status: 'ok' });
    });
  });
});
