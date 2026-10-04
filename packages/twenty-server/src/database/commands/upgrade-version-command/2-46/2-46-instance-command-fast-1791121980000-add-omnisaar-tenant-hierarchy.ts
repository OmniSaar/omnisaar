import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980000)
export class AddOmniSaarTenantHierarchyFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."tenant" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" text NOT NULL,
        "slug" text NOT NULL,
        "status" text NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_TENANT_ID" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_TENANT_SLUG_UNIQUE" ON "core"."tenant" ("slug")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "core"."tenantWorkspace" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_TENANT_WORKSPACE_ID" PRIMARY KEY ("id"),
        CONSTRAINT "FK_TENANT_WORKSPACE_TENANT_ID" FOREIGN KEY ("tenantId")
          REFERENCES "core"."tenant"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_TENANT_WORKSPACE_WORKSPACE_ID" FOREIGN KEY ("workspaceId")
          REFERENCES "core"."workspace"("id") ON DELETE CASCADE
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_TENANT_WORKSPACE_WORKSPACE_ID_UNIQUE" ON "core"."tenantWorkspace" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TENANT_WORKSPACE_TENANT_ID" ON "core"."tenantWorkspace" ("tenantId")`,
    );

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "core"."ensureWorkspaceTenant"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        INSERT INTO "core"."tenant" (
          "id",
          "name",
          "slug",
          "status",
          "createdAt",
          "updatedAt"
        ) VALUES (
          NEW."id",
          COALESCE(NULLIF(NEW."displayName", ''), 'Workspace'),
          'workspace-' || NEW."id"::text,
          'active',
          COALESCE(NEW."createdAt", now()),
          COALESCE(NEW."updatedAt", now())
        )
        ON CONFLICT ("id") DO NOTHING;

        INSERT INTO "core"."tenantWorkspace" (
          "id",
          "tenantId",
          "workspaceId",
          "createdAt",
          "updatedAt"
        ) VALUES (
          NEW."id",
          NEW."id",
          NEW."id",
          COALESCE(NEW."createdAt", now()),
          COALESCE(NEW."updatedAt", now())
        )
        ON CONFLICT ("workspaceId") DO NOTHING;

        RETURN NEW;
      END;
      $$;
    `);

    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_ENSURE_WORKSPACE_TENANT" ON "core"."workspace"`,
    );
    await queryRunner.query(`
      CREATE TRIGGER "TRG_ENSURE_WORKSPACE_TENANT"
      AFTER INSERT ON "core"."workspace"
      FOR EACH ROW
      EXECUTE FUNCTION "core"."ensureWorkspaceTenant"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS "TRG_ENSURE_WORKSPACE_TENANT" ON "core"."workspace"`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS "core"."ensureWorkspaceTenant"()`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."tenantWorkspace"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."tenant"`);
  }
}
