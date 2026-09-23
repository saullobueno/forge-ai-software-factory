import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';

@Module({
  imports: [QueueModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
