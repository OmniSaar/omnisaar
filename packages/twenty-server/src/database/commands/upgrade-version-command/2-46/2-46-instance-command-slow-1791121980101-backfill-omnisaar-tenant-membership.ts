import { type DataSource, type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type SlowInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/slow-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980101, { type: 'slow' })
export class BackfillOmniSaarTenantMembershipSlowInstanceCommand
  implements SlowInstanceCommand
{
  public async runDataMigration(dataSource: DataSource): Promise<void> {
    await dataSource.query(`
      INSERT INTO "core"."tenantMembership" (
        "tenantId",
        "userId",
        "role",
        "status",
        "administrationCapabilities",
        "createdAt",
        "updatedAt"
      )
      SELECT DISTINCT
        tw."tenantId",
        uw."userId",
        'member',
        'active',
        '[]'::jsonb,
        LEAST(uw."createdAt", tw."createdAt"),
        GREATEST(uw."updatedAt", tw."updatedAt")
      FROM "core"."userWorkspace" uw
      INNER JOIN "core"."tenantWorkspace" tw
        ON tw."workspaceId" = uw."workspaceId"
      WHERE uw."deletedAt" IS NULL
      ON CONFLICT ("tenantId", "userId") DO NOTHING
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS "missingCount"
      FROM "core"."userWorkspace" uw
      INNER JOIN "core"."tenantWorkspace" tw
        ON tw."workspaceId" = uw."workspaceId"
      LEFT JOIN "core"."tenantMembership" tm
        ON tm."tenantId" = tw."tenantId"
       AND tm."userId" = uw."userId"
      WHERE uw."deletedAt" IS NULL
        AND tm."id" IS NULL
    `)) as Array<{ missingCount: number }>;

    const missingCount = Number(rows[0]?.missingCount ?? 0);

    if (missingCount > 0) {
      throw new Error(
        `OmniSaar tenant membership backfill left ${missingCount} active workspace memberships without tenant membership`,
      );
    }
  }

  public async down(): Promise<void> {
    // The fast command owns schema rollback. Backfilled memberships are removed
    // when the table is dropped, avoiding destructive guesses about later edits.
  }
}
