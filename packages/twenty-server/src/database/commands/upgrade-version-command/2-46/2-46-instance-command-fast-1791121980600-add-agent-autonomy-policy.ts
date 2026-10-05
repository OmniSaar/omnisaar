import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980600)
export class AddAgentAutonomyPolicyFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."agentAutonomyPolicy" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "agentId" uuid NOT NULL,
        "actionPrefix" varchar NOT NULL,
        "decision" varchar NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "reason" text,
        "createdByPrincipalId" varchar NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_AGENT_AUTONOMY_POLICY_ID" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_AGENT_AUTONOMY_POLICY_DECISION" CHECK (
          "decision" IN ('allow', 'approval_required', 'deny')
        ),
        CONSTRAINT "CHK_AGENT_AUTONOMY_POLICY_ACTION_PREFIX" CHECK (
          length(trim("actionPrefix")) > 0
        )
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_AGENT_AUTONOMY_POLICY_SCOPE_ACTION_UNIQUE"
      ON "core"."agentAutonomyPolicy" (
        "tenantId",
        "workspaceId",
        "agentId",
        "actionPrefix"
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_AGENT_AUTONOMY_POLICY_LOOKUP"
      ON "core"."agentAutonomyPolicy" (
        "tenantId",
        "workspaceId",
        "agentId",
        "enabled"
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."agentAutonomyPolicy"`);
  }
}
