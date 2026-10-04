import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980100)
export class AddOmniSaarTenantMembershipFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."tenantMembership" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "role" varchar NOT NULL DEFAULT 'member',
        "status" varchar NOT NULL DEFAULT 'active',
        "administrationCapabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_TENANT_MEMBERSHIP_ID" PRIMARY KEY ("id"),
        CONSTRAINT "FK_TENANT_MEMBERSHIP_TENANT_ID" FOREIGN KEY ("tenantId")
          REFERENCES "core"."tenant"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_TENANT_MEMBERSHIP_USER_ID" FOREIGN KEY ("userId")
          REFERENCES "core"."user"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_TENANT_MEMBERSHIP_ROLE" CHECK ("role" IN ('owner', 'admin', 'member')),
        CONSTRAINT "CHK_TENANT_MEMBERSHIP_STATUS" CHECK ("status" IN ('active', 'suspended')),
        CONSTRAINT "CHK_TENANT_ADMIN_CAPABILITIES_ARRAY" CHECK (
          jsonb_typeof("administrationCapabilities") = 'array'
        ),
        CONSTRAINT "CHK_TENANT_MEMBER_HAS_NO_ADMIN_CAPABILITIES" CHECK (
          "role" <> 'member' OR jsonb_array_length("administrationCapabilities") = 0
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_TENANT_MEMBERSHIP_TENANT_USER_UNIQUE"
      ON "core"."tenantMembership" ("tenantId", "userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_TENANT_MEMBERSHIP_TENANT_ID"
      ON "core"."tenantMembership" ("tenantId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_TENANT_MEMBERSHIP_USER_ID"
      ON "core"."tenantMembership" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."tenantMembership"`,
    );
  }
}
