import { Injectable } from '@nestjs/common';
import type { AgentRunStatus } from '@forge/types';
import { Subject } from 'rxjs';

export interface AgentRunStatusEvent {
  agentRunId: string;
  status: AgentRunStatus;
}

/**
 * Pub/sub em processo (Fase 6 — spec §9: "transmitir logs e status via
 * WebSockets/SSE"), um `Subject` por `agentRunId`. Deliberadamente em
 * memória, sem Redis/BullMQ: o único produtor real nesta fase é
 * `AgentRunsService.cancel` (ver comentário lá — não existe ainda um
 * orquestrador real processando execuções, isso é Fase 7); múltiplas
 * réplicas do processo da API precisariam de um broker compartilhado para
 * este canal continuar funcionando entre processos, mas essa não é a
 * topologia deste portfólio.
 */
@Injectable()
export class AgentRunEventsService {
  private readonly subjects = new Map<string, Subject<AgentRunStatusEvent>>();

  private subjectFor(agentRunId: string): Subject<AgentRunStatusEvent> {
    const existing = this.subjects.get(agentRunId);
    if (existing) return existing;

    const created = new Subject<AgentRunStatusEvent>();
    this.subjects.set(agentRunId, created);
    return created;
  }

  publish(event: AgentRunStatusEvent): void {
    this.subjectFor(event.agentRunId).next(event);
  }

  /** Observable "quente" — só recebe eventos publicados DEPOIS da inscrição; quem assina decide o snapshot inicial (ver `AgentRunsService.streamEvents`). */
  stream(agentRunId: string) {
    return this.subjectFor(agentRunId).asObservable();
  }
}
