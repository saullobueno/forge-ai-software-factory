import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CodeModule } from './modules/code/code.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';

@Module({
  imports: [DatabaseModule, QueueModule, AuthModule, ProjectsModule, TasksModule, CodeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
