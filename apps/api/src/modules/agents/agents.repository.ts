import { Injectable } from '@nestjs/common';
import { and, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type AgentRow = typeof schema.agents.$inferSelect;

/**
 * Camada de acesso a dados para Agent (Fase 4 — só o suficiente para
 * escolher um agente existente ao disparar uma execução de IA a partir de
 * uma tarefa; CRUD/gestão completa de agentes é fora de escopo aqui).
 * `organizationId` no `WHERE`, mesmo padrão de tenant scoping de
 * `ProjectsRepository`.
 */
@Injectable()
export class AgentsRepository {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Prefere o agente de papel `planner` (ponto de entrada natural de uma
   * execução — spec §8/§9: "Na Fila -> Planejando -> ...") e cai para o
   * primeiro agente habilitado da organização quando não há um planner
   * configurado. Retorna `undefined` se a organização não tiver nenhum
   * agente habilitado — quem chama decide como tratar esse caso.
   */
  async findPlannerOrFirstEnabled(organizationId: string): Promise<AgentRow | undefined> {
    const planner = await this.database.db.query.agents.findFirst({
      where: and(
        eq(schema.agents.organizationId, organizationId),
        eq(schema.agents.role, 'planner'),
        eq(schema.agents.isEnabled, true),
      ),
    });
    if (planner) return planner;

    return this.database.db.query.agents.findFirst({
      where: and(eq(schema.agents.organizationId, organizationId), eq(schema.agents.isEnabled, true)),
    });
  }
}
