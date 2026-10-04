import { type QueryRunner } from 'typeorm';

import { RegisteredInstanceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-instance-command.decorator';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';

@RegisteredInstanceCommand('2.46.0', 1791121980400)
export class AddOmniSaarActivityLedgerFastInstanceCommand
  implements FastInstanceCommand
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "core"."activityLedgerEvent" (
        "eventId" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "eventType" varchar NOT NULL,
        "occurredAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "recordedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "instanceId" varchar,
        "tenantId" uuid,
        "workspaceId" uuid,
        "actorType" varchar NOT NULL,
        "actorId" varchar,
        "requesterId" varchar,
        "membershipId" uuid,
        "correlationId" varchar NOT NULL,
        "causationId" uuid,
        "subjectType" varchar NOT NULL,
        "subjectId" varchar,
        "action" varchar NOT NULL,
        "result" varchar NOT NULL,
        "approvalState" varchar,
        "provider" varchar,
        "integrationConnectionId" uuid,
        "durationMs" integer,
        "cost" numeric(18, 6),
        "tokenUsage" integer,
        "idempotencyKey" varchar,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "artifactReferences" jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT "PK_ACTIVITY_LEDGER_EVENT_ID" PRIMARY KEY ("eventId"),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_ACTOR_TYPE" CHECK (
          "actorType" IN ('human', 'agent', 'automation', 'provider', 'system')
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_RESULT" CHECK (
          "result" IN ('success', 'failure', 'pending', 'denied', 'cancelled')
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_METADATA_OBJECT" CHECK (
          jsonb_typeof("metadata") = 'object'
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_ARTIFACT_REFS_ARRAY" CHECK (
          jsonb_typeof("artifactReferences") = 'array'
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_DURATION_NONNEGATIVE" CHECK (
          "durationMs" IS NULL OR "durationMs" >= 0
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_COST_NONNEGATIVE" CHECK (
          "cost" IS NULL OR "cost" >= 0
        ),
        CONSTRAINT "CHK_ACTIVITY_LEDGER_TOKEN_USAGE_NONNEGATIVE" CHECK (
          "tokenUsage" IS NULL OR "tokenUsage" >= 0
        )
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_TENANT_OCCURRED_AT"
      ON "core"."activityLedgerEvent" ("tenantId", "occurredAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_WORKSPACE_OCCURRED_AT"
      ON "core"."activityLedgerEvent" ("workspaceId", "occurredAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_EVENT_TYPE_OCCURRED_AT"
      ON "core"."activityLedgerEvent" ("eventType", "occurredAt" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_CORRELATION_ID"
      ON "core"."activityLedgerEvent" ("correlationId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_ACTOR"
      ON "core"."activityLedgerEvent" ("actorType", "actorId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_SUBJECT"
      ON "core"."activityLedgerEvent" ("subjectType", "subjectId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_IDEMPOTENCY_KEY"
      ON "core"."activityLedgerEvent" ("idempotencyKey")
    `);

    // A caller-supplied idempotency key is unique within its tenant/workspace
    // scope. COALESCE makes instance/tenant-level null scope deterministic.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ACTIVITY_LEDGER_SCOPED_IDEMPOTENCY_UNIQUE"
      ON "core"."activityLedgerEvent" (
        COALESCE("tenantId", '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE("workspaceId", '00000000-0000-0000-0000-000000000000'::uuid),
        "idempotencyKey"
      )
      WHERE "idempotencyKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "core"."activityLedgerEvent"`,
    );
  }
}
