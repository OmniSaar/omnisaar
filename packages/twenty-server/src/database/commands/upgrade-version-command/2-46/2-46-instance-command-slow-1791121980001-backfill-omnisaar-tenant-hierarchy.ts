import { type DataSource, type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980001, { type: 'slow' })
export class BackfillOmniSaarTenantHierarchySlowInstanceCommand
  implements SlowInstanceCommand
{
  public async runDataMigration(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      INSERT INTO "core"."tenant" (
        "id",
        "name",
        "slug",
        "status",
        "createdAt",
        "updatedAt"
      )
      SELECT
        workspace."id",
        COALESCE(NULLIF(workspace."displayName", ''), 'Workspace'),
        'workspace-' || workspace."id"::text,
        'active',
        workspace."createdAt",
        workspace."updatedAt"
      FROM "core"."workspace" workspace
      ON CONFLICT ("id") DO NOTHING
    `);

    await dataSource.query(`
      INSERT INTO "core"."tenantWorkspace" (
        "id",
        "tenantId",
        "workspaceId",
        "createdAt",
        "updatedAt"
      )
      SELECT
        workspace."id",
        workspace."id",
        workspace."id",
        workspace."createdAt",
        workspace."updatedAt"
      FROM "core"."workspace" workspace
      ON CONFLICT ("workspaceId") DO NOTHING
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM "core"."workspace" workspace
          LEFT JOIN "core"."tenantWorkspace" tenant_workspace
            ON tenant_workspace."workspaceId" = workspace."id"
          WHERE tenant_workspace."workspaceId" IS NULL
        ) THEN
          RAISE EXCEPTION 'OmniSaar tenant hierarchy backfill left unscoped workspaces';
        END IF;
      END;
      $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // The paired fast command drops the OmniSaar tenant hierarchy tables.
  }
}
