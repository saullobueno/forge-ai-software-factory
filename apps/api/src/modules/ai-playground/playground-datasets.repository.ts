import { Injectable } from '@nestjs/common';
import { and, desc, eq, schema } from '@forge/database';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

export type DatasetRow = typeof schema.playgroundDatasets.$inferSelect;
export type DatasetVersionRow = typeof schema.playgroundDatasetVersions.$inferSelect;

/** Datasets do Playground e suas versões imutáveis — sempre filtrados por `organizationId`. */
@Injectable()
export class PlaygroundDatasetsRepository {
  constructor(private readonly database: DatabaseService) {}

  async listDatasets(organizationId: string): Promise<DatasetRow[]> {
    return this.database.db
      .select()
      .from(schema.playgroundDatasets)
      .where(eq(schema.playgroundDatasets.organizationId, organizationId))
      .orderBy(desc(schema.playgroundDatasets.updatedAt));
  }

  async findDataset(id: string, organizationId: string): Promise<DatasetRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.playgroundDatasets)
      .where(and(eq(schema.playgroundDatasets.id, id), eq(schema.playgroundDatasets.organizationId, organizationId)))
      .limit(1);
    return rows[0];
  }

  async listVersions(datasetId: string, organizationId: string): Promise<DatasetVersionRow[]> {
    return this.database.db
      .select()
      .from(schema.playgroundDatasetVersions)
      .where(
        and(
          eq(schema.playgroundDatasetVersions.datasetId, datasetId),
          eq(schema.playgroundDatasetVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(schema.playgroundDatasetVersions.version));
  }

  async listAllLatestVersions(organizationId: string): Promise<DatasetVersionRow[]> {
    const rows = await this.database.db
      .select()
      .from(schema.playgroundDatasetVersions)
      .where(eq(schema.playgroundDatasetVersions.organizationId, organizationId))
      .orderBy(desc(schema.playgroundDatasetVersions.version));
    const latest = new Map<string, DatasetVersionRow>();
    for (const row of rows) if (!latest.has(row.datasetId)) latest.set(row.datasetId, row);
    return [...latest.values()];
  }

  async findVersionById(versionId: string, organizationId: string): Promise<DatasetVersionRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.playgroundDatasetVersions)
      .where(
        and(
          eq(schema.playgroundDatasetVersions.id, versionId),
          eq(schema.playgroundDatasetVersions.organizationId, organizationId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async findVersion(datasetId: string, version: number, organizationId: string): Promise<DatasetVersionRow | undefined> {
    const rows = await this.database.db
      .select()
      .from(schema.playgroundDatasetVersions)
      .where(
        and(
          eq(schema.playgroundDatasetVersions.datasetId, datasetId),
          eq(schema.playgroundDatasetVersions.version, version),
          eq(schema.playgroundDatasetVersions.organizationId, organizationId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  async createDataset(input: {
    organizationId: string;
    name: string;
    description: string | null;
    createdByUserId: string;
    items: DatasetVersionRow['items'];
  }): Promise<{ dataset: DatasetRow; version: DatasetVersionRow }> {
    const [dataset] = await this.database.db
      .insert(schema.playgroundDatasets)
      .values({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        createdByUserId: input.createdByUserId,
      })
      .returning();
    if (!dataset) throw new Error('dataset não inserido');
    const version = await this.insertVersion(dataset.id, input.organizationId, 1, input.items, null, input.createdByUserId);
    return { dataset, version };
  }

  async addVersion(input: {
    datasetId: string;
    organizationId: string;
    items: DatasetVersionRow['items'];
    note: string | null;
    createdByUserId: string;
  }): Promise<DatasetVersionRow> {
    const versions = await this.listVersions(input.datasetId, input.organizationId);
    const next = (versions[0]?.version ?? 0) + 1;
    const version = await this.insertVersion(input.datasetId, input.organizationId, next, input.items, input.note, input.createdByUserId);
    await this.database.db
      .update(schema.playgroundDatasets)
      .set({ updatedAt: new Date() })
      .where(and(eq(schema.playgroundDatasets.id, input.datasetId), eq(schema.playgroundDatasets.organizationId, input.organizationId)));
    return version;
  }

  private async insertVersion(
    datasetId: string,
    organizationId: string,
    version: number,
    items: DatasetVersionRow['items'],
    note: string | null,
    createdByUserId: string,
  ): Promise<DatasetVersionRow> {
    const rows = await this.database.db
      .insert(schema.playgroundDatasetVersions)
      .values({ datasetId, organizationId, version, items, note, createdByUserId })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('versão não inserida');
    return row;
  }

  async deleteDataset(id: string, organizationId: string): Promise<void> {
    await this.database.db
      .delete(schema.playgroundDatasets)
      .where(and(eq(schema.playgroundDatasets.id, id), eq(schema.playgroundDatasets.organizationId, organizationId)));
  }

  async userNames(organizationId: string): Promise<Map<string, string>> {
    const rows = await this.database.db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.organizationId, organizationId));
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
