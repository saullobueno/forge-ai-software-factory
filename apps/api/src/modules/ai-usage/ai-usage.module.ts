import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AiUsageController } from './ai-usage.controller.js';
import { AiUsageRepository } from './ai-usage.repository.js';
import { AiUsageService } from './ai-usage.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AiUsageController],
  providers: [AiUsageRepository, AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
