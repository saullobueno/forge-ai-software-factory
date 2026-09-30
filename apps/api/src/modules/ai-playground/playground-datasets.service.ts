import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AIPlaygroundDatasetItem,
  CreatePlaygroundDatasetRequest,
  CreatePlaygroundDatasetVersionRequest,
  MemberRole,
  PlaygroundDatasetDetail,
  PlaygroundDatasetSummary,
  PlaygroundDatasetVersionDetail,
  PlaygroundDatasetVersionSummary,
} from '@forge/types';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { PlaygroundDatasetsRepository, type DatasetRow, type DatasetVersionRow } from './playground-datasets.repository.js';

export interface DatasetActor {
  userId: string;
  organizationId: string;
  role: MemberRole;
}

@Injectable()
export class PlaygroundDatasetsService {
  constructor(
    private readonly repository: PlaygroundDatasetsRepository,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private versionSummary(row: DatasetVersionRow, names: Map<string, string>): PlaygroundDatasetVersionSummary {
    return {
      id: row.id,
      version: row.version,
      note: row.note,
      itemsCount: row.items.length,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByUserId ? (names.get(row.createdByUserId) ?? null) : null,
    };
  }

  private async requireDataset(id: string, organizationId: string): Promise<DatasetRow> {
    const dataset = await this.repository.findDataset(id, organizationId);
    if (!dataset) throw new NotFoundException('Dataset não encontrado.');
    return dataset;
  }

  async list(organizationId: string): Promise<PlaygroundDatasetSummary[]> {
    const [datasets, latest, names] = await Promise.all([
      this.repository.listDatasets(organizationId),
      this.repository.listAllLatestVersions(organizationId),
      this.repository.userNames(organizationId),
    ]);
    const latestByDataset = new Map(latest.map((row) => [row.datasetId, row]));
    return datasets.flatMap((dataset) => {
      const version = latestByDataset.get(dataset.id);
      if (!version) return [];
      return [
        {
          id: dataset.id,
          name: dataset.name,
          description: dataset.description,
          latestVersion: this.versionSummary(version, names),
          createdByName: dataset.createdByUserId ? (names.get(dataset.createdByUserId) ?? null) : null,
          updatedAt: dataset.updatedAt.toISOString(),
        },
      ];
    });
  }

  async get(id: string, organizationId: string): Promise<PlaygroundDatasetDetail> {
    const dataset = await this.requireDataset(id, organizationId);
    const [versions, names] = await Promise.all([
      this.repository.listVersions(id, organizationId),
      this.repository.userNames(organizationId),
    ]);
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      createdByName: dataset.createdByUserId ? (names.get(dataset.createdByUserId) ?? null) : null,
      updatedAt: dataset.updatedAt.toISOString(),
      versions: versions.map((row) => this.versionSummary(row, names)),
    };
  }

  async getVersion(id: string, version: number, organizationId: string): Promise<PlaygroundDatasetVersionDetail> {
    await this.requireDataset(id, organizationId);
    const row = await this.repository.findVersion(id, version, organizationId);
    if (!row) throw new NotFoundException('Versão não encontrada.');
    const names = await this.repository.userNames(organizationId);
    return { ...this.versionSummary(row, names), datasetId: id, items: row.items };
  }

  /** Itens de uma versão para avaliar (por id da versão); `undefined` se não existir no tenant. */
  async resolveVersionItems(versionId: string, organizationId: string): Promise<AIPlaygroundDatasetItem[] | undefined> {
    const row = await this.repository.findVersionById(versionId, organizationId);
    return row?.items;
  }

  async create(actor: DatasetActor, input: CreatePlaygroundDatasetRequest): Promise<PlaygroundDatasetDetail> {
    const { dataset } = await this.repository.createDataset({
      organizationId: actor.organizationId,
      name: input.name,
      description: input.description ?? null,
      createdByUserId: actor.userId,
      items: input.items,
    });
    await this.auditLogsService.record({
      organizationId: actor.organizationId,
      actorType: 'user',
      actorUserId: actor.userId,
      action: 'playground_dataset.created',
      targetType: 'playground_dataset',
      targetId: dataset.id,
      metadata: { name: dataset.name, itemsCount: input.items.length },
    });
    return this.get(dataset.id, actor.organizationId);
  }

  async addVersion(id: string, actor: DatasetActor, input: CreatePlaygroundDatasetVersionRequest): Promise<PlaygroundDatasetVersionDetail> {
    await this.requireDataset(id, actor.organizationId);
    const row = await this.repository.addVersion({
      datasetId: id,
      organizationId: actor.organizationId,
      items: input.items,
      note: input.note ?? null,
      createdByUserId: actor.userId,
    });
    await this.auditLogsService.record({
      organizationId: actor.organizationId,
      actorType: 'user',
      actorUserId: actor.userId,
      action: 'playground_dataset.version_created',
      targetType: 'playground_dataset',
      targetId: id,
      metadata: { version: row.version, itemsCount: input.items.length },
    });
    return this.getVersion(id, row.version, actor.organizationId);
  }

  /** Só quem criou ou um admin apaga (o histórico inteiro vai junto). */
  async remove(id: string, actor: DatasetActor): Promise<void> {
    const dataset = await this.requireDataset(id, actor.organizationId);
    if (dataset.createdByUserId !== actor.userId && actor.role !== 'admin') {
      throw new ForbiddenException('Só quem criou o dataset ou um administrador pode removê-lo.');
    }
    await this.repository.deleteDataset(id, actor.organizationId);
    await this.auditLogsService.record({
      organizationId: actor.organizationId,
      actorType: 'user',
      actorUserId: actor.userId,
      action: 'playground_dataset.deleted',
      targetType: 'playground_dataset',
      targetId: id,
      metadata: { name: dataset.name },
    });
  }
}
