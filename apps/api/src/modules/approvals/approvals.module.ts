import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ApprovalsController } from './approvals.controller.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { ApprovalsService } from './approvals.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsRepository, ApprovalsService],
})
export class ApprovalsModule {}
