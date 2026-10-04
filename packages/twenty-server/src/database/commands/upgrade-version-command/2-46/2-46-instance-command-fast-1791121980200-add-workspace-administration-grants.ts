import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980200)
export class AddWorkspaceAdministrationGrantsFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."workspaceAdministrationGrant" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantMembershipId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "administrationCapabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" varchar NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_WORKSPACE_ADMIN_GRANT_ID" PRIMARY KEY ("id"),
        CONSTRAINT "FK_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_ID" FOREIGN KEY ("tenantMembershipId")
          REFERENCES "core"."tenantMembership"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_WORKSPACE_ADMIN_GRANT_WORKSPACE_ID" FOREIGN KEY ("workspaceId")
          REFERENCES "core"."workspace"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_WORKSPACE_ADMIN_GRANT_STATUS" CHECK ("status" IN ('active', 'suspended')),
        CONSTRAINT "CHK_WORKSPACE_ADMIN_GRANT_CAPABILITIES_ARRAY" CHECK (
          jsonb_typeof("administrationCapabilities") = 'array'
        ),
        CONSTRAINT "CHK_WORKSPACE_ADMIN_GRANT_KNOWN_CAPABILITIES" CHECK (
          "administrationCapabilities" <@ '[
            "workspace.users.manage",
            "workspace.roles.manage",
            "workspace.admins.delegate",
            "workspace.integrations.manage",
            "workspace.settings.manage",
            "workspace.agents.manage",
            "workspace.approvals.manage",
            "workspace.reports.view"
          ]'::jsonb
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_WORKSPACE_UNIQUE"
      ON "core"."workspaceAdministrationGrant" ("tenantMembershipId", "workspaceId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_ID"
      ON "core"."workspaceAdministrationGrant" ("tenantMembershipId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_WORKSPACE_ADMIN_GRANT_WORKSPACE_ID"
      ON "core"."workspaceAdministrationGrant" ("workspaceId")
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "core"."validateWorkspaceAdministrationGrantScope"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        membership_tenant_id uuid;
        workspace_tenant_id uuid;
      BEGIN
        SELECT "tenantId"
          INTO membership_tenant_id
          FROM "core"."tenantMembership"
          WHERE "id" = NEW."tenantMembershipId";

        SELECT "tenantId"
          INTO workspace_tenant_id
          FROM "core"."tenantWorkspace"
          WHERE "workspaceId" = NEW."workspaceId";

        IF membership_tenant_id IS NULL OR workspace_tenant_id IS NULL THEN
          RAISE EXCEPTION 'Workspace administration grant scope could not be resolved';
        END IF;

        IF membership_tenant_id <> workspace_tenant_id THEN
          RAISE EXCEPTION 'Workspace administration grant cannot cross tenant boundaries';
        END IF;

        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_VALIDATE_WORKSPACE_ADMIN_GRANT_SCOPE" ON "core"."workspaceAdministrationGrant"`,
    );

    await queryRunner.query(`
      CREATE TRIGGER "TRG_VALIDATE_WORKSPACE_ADMIN_GRANT_SCOPE"
      BEFORE INSERT OR UPDATE OF "tenantMembershipId", "workspaceId"
      ON "core"."workspaceAdministrationGrant"
      FOR EACH ROW
      EXECUTE FUNCTION "core"."validateWorkspaceAdministrationGrantScope"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_VALIDATE_WORKSPACE_ADMIN_GRANT_SCOPE" ON "core"."workspaceAdministrationGrant"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "core"."validateWorkspaceAdministrationGrantScope"()`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."workspaceAdministrationGrant"`,
    );
  }
}
