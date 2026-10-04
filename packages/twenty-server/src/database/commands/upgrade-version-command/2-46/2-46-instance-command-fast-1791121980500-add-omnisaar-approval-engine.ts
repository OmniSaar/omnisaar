import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980500)
export class AddOmniSaarApprovalEngineFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."approvalRequest" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantId" uuid NOT NULL,
        "workspaceId" uuid NOT NULL,
        "agentTurnId" uuid,
        "agentId" uuid,
        "requestedByPrincipalType" varchar NOT NULL,
        "requestedByPrincipalId" varchar NOT NULL,
        "requesterId" varchar,
        "membershipId" uuid,
        "actionType" varchar NOT NULL,
        "toolName" varchar,
        "actionHash" varchar(64) NOT NULL,
        "actionPreview" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "policySnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "requiredApproverRoleId" uuid,
        "status" varchar NOT NULL DEFAULT 'pending',
        "decidedByPrincipalId" varchar,
        "decisionReason" text,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "executionId" varchar,
        "correlationId" varchar NOT NULL,
        "idempotencyKey" varchar,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_APPROVAL_REQUEST_ID" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_APPROVAL_REQUEST_STATUS" CHECK (
          "status" IN ('pending', 'approved', 'denied', 'expired', 'cancelled')
        ),
        CONSTRAINT "CHK_APPROVAL_REQUESTER_TYPE" CHECK (
          "requestedByPrincipalType" IN ('human', 'agent', 'automation', 'system')
        ),
        CONSTRAINT "CHK_APPROVAL_ACTION_HASH_LENGTH" CHECK (
          length("actionHash") = 64
        ),
        CONSTRAINT "CHK_APPROVAL_ACTION_PREVIEW_OBJECT" CHECK (
          jsonb_typeof("actionPreview") = 'object'
        ),
        CONSTRAINT "CHK_APPROVAL_POLICY_SNAPSHOT_OBJECT" CHECK (
          jsonb_typeof("policySnapshot") = 'object'
        ),
        CONSTRAINT "CHK_APPROVAL_EXPIRY_AFTER_CREATION" CHECK (
          "expiresAt" > "createdAt"
        ),
        CONSTRAINT "CHK_APPROVAL_DECISION_FIELDS" CHECK (
          "status" NOT IN ('approved', 'denied') OR
          ("decidedAt" IS NOT NULL AND "decidedByPrincipalId" IS NOT NULL)
        ),
        CONSTRAINT "CHK_APPROVAL_CONSUMPTION_FIELDS" CHECK (
          (("consumedAt" IS NULL AND "executionId" IS NULL) OR
          ("consumedAt" IS NOT NULL AND "executionId" IS NOT NULL AND "status" = 'approved'))
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_TENANT_WORKSPACE_STATUS_CREATED_AT"
      ON "core"."approvalRequest" ("tenantId", "workspaceId", "status", "createdAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_CORRELATION_ID"
      ON "core"."approvalRequest" ("correlationId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_ACTION_HASH"
      ON "core"."approvalRequest" ("actionHash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_AGENT_TURN_ID"
      ON "core"."approvalRequest" ("agentTurnId")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_SCOPED_IDEMPOTENCY_UNIQUE"
      ON "core"."approvalRequest" ("tenantId", "workspaceId", "idempotencyKey")
      WHERE "idempotencyKey" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_APPROVAL_REQUEST_WORKSPACE_EXECUTION_UNIQUE"
      ON "core"."approvalRequest" ("workspaceId", "executionId")
      WHERE "executionId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "core"."approvalRequest"`);
  }
}
