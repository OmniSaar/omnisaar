import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980300)
export class HardenOmniSaarTenantProvisioningFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_TENANT_MEMBERSHIP_ONE_ACTIVE_OWNER"
      ON "core"."tenantMembership" ("tenantId")
      WHERE "role" = 'owner' AND "status" = 'active'
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "core"."ensureTenantMembershipForUserWorkspace"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        resolved_tenant_id uuid;
      BEGIN
        SELECT "tenantId"
          INTO resolved_tenant_id
          FROM "core"."tenantWorkspace"
          WHERE "workspaceId" = NEW."workspaceId";

        IF resolved_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Tenant scope missing for workspace %', NEW."workspaceId";
        END IF;

        INSERT INTO "core"."tenantMembership" (
          "tenantId",
          "userId",
          "role",
          "status",
          "administrationCapabilities",
          "createdAt",
          "updatedAt"
        ) VALUES (
          resolved_tenant_id,
          NEW."userId",
          'member',
          'active',
          '[]'::jsonb,
          COALESCE(NEW."createdAt", now()),
          COALESCE(NEW."updatedAt", now())
        )
        ON CONFLICT ("tenantId", "userId") DO NOTHING;

        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_ENSURE_TENANT_MEMBERSHIP_FOR_USER_WORKSPACE" ON "core"."userWorkspace"`,
    );

    await queryRunner.query(`
      CREATE TRIGGER "TRG_ENSURE_TENANT_MEMBERSHIP_FOR_USER_WORKSPACE"
      AFTER INSERT ON "core"."userWorkspace"
      FOR EACH ROW
      EXECUTE FUNCTION "core"."ensureTenantMembershipForUserWorkspace"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_ENSURE_TENANT_MEMBERSHIP_FOR_USER_WORKSPACE" ON "core"."userWorkspace"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "core"."ensureTenantMembershipForUserWorkspace"()`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "core"."IDX_TENANT_MEMBERSHIP_ONE_ACTIVE_OWNER"`,
    );
  }
}
