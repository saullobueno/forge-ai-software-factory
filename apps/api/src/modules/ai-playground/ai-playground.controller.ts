import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { aiPlaygroundEvaluationRequestSchema, type AIPlaygroundEvaluationRequest } from '@forge/types';
import { ZodValidationPipe } from '../../infrastructure/validation/zod-validation.pipe.js';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/permissions.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';
import { AIPlaygroundService } from './ai-playground.service.js';

@Controller('ai-playground')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AIPlaygroundController {
  constructor(
    private readonly playground: AIPlaygroundService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  @Get('config')
  @RequirePermission('ai_playground:use')
  config() {
    return {
      models: this.playground.getModels(),
      defaultDataset: this.playground.getDefaultDataset(),
    };
  }

  @Post('evaluations')
  @RequirePermission('ai_playground:use')
  async evaluate(
    @Body(new ZodValidationPipe(aiPlaygroundEvaluationRequestSchema)) input: AIPlaygroundEvaluationRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const evaluation = this.playground.evaluate(input);
    await this.auditLogsService.record({
      organizationId: user.organizationId,
      actorType: 'user',
      actorUserId: user.userId,
      action: 'ai_playground.evaluated',
      targetType: 'ai_playground',
      metadata: {
        models: input.models,
        datasetSize: input.dataset.length,
        requireStructuredOutput: input.requireStructuredOutput ?? false,
        winner: evaluation.winner,
        totalTokens: evaluation.results.reduce((total, result) => total + result.totalTokens, 0),
        totalCostUsd: evaluation.results.reduce((total, result) => total + result.totalCostUsd, 0),
      },
    });
    return evaluation;
  }
}
