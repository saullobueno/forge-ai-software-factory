import { Injectable, Logger } from '@nestjs/common';
import type { AgentRunTraceEvent, AgentRunTraceSink } from '@forge/agents';
import { redactSensitiveValues } from '../../infrastructure/logging/redaction.js';

@Injectable()
export class AgentRunTraceLoggerService implements AgentRunTraceSink {
  private readonly logger = new Logger(AgentRunTraceLoggerService.name);

  record(event: AgentRunTraceEvent): void {
    if (process.env['FORGE_TRACE_LOGS'] !== '1') return;
    this.logger.debug(JSON.stringify(redactSensitiveValues(event)));
  }
}
