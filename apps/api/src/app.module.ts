import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { AIPlaygroundModule } from './modules/ai-playground/ai-playground.module.js';
import { AiUsageModule } from './modules/ai-usage/ai-usage.module.js';
import { AgentRunsModule } from './modules/agent-runs/agent-runs.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { ArtifactsModule } from './modules/artifacts/artifacts.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CodeModule } from './modules/code/code.module.js';
import { EnvironmentsModule } from './modules/environments/environments.module.js';
import { KnowledgeModule } from './modules/knowledge/knowledge.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
    CodeModule,
    AIPlaygroundModule,
    AiUsageModule,
    AgentRunsModule,
    ApprovalsModule,
    ArtifactsModule,
    AuditLogsModule,
    EnvironmentsModule,
    KnowledgeModule,
    UsersModule,
    SearchModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
