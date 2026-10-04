import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const ACTIVITY_LEDGER_ACTOR_TYPES = [
  'human',
  'agent',
  'automation',
  'provider',
  'system',
] as const;

export type ActivityLedgerActorType =
  (typeof ACTIVITY_LEDGER_ACTOR_TYPES)[number];

export const ACTIVITY_LEDGER_RESULTS = [
  'success',
  'failure',
  'pending',
  'denied',
  'cancelled',
] as const;

export type ActivityLedgerResult = (typeof ACTIVITY_LEDGER_RESULTS)[number];

@Entity({ name: 'activityLedgerEvent', schema: 'core' })
@Index('IDX_ACTIVITY_LEDGER_TENANT_OCCURRED_AT', ['tenantId', 'occurredAt'])
@Index('IDX_ACTIVITY_LEDGER_WORKSPACE_OCCURRED_AT', [
  'workspaceId',
  'occurredAt',
])
@Index('IDX_ACTIVITY_LEDGER_EVENT_TYPE_OCCURRED_AT', [
  'eventType',
  'occurredAt',
])
@Index('IDX_ACTIVITY_LEDGER_CORRELATION_ID', ['correlationId'])
@Index('IDX_ACTIVITY_LEDGER_ACTOR', ['actorType', 'actorId'])
@Index('IDX_ACTIVITY_LEDGER_SUBJECT', ['subjectType', 'subjectId'])
@Index('IDX_ACTIVITY_LEDGER_IDEMPOTENCY_KEY', ['idempotencyKey'])
@Check(
  'CHK_ACTIVITY_LEDGER_ACTOR_TYPE',
  `"actorType" IN ('human', 'agent', 'automation', 'provider', 'system')`,
)
@Check(
  'CHK_ACTIVITY_LEDGER_RESULT',
  `"result" IN ('success', 'failure', 'pending', 'denied', 'cancelled')`,
)
@Check(
  'CHK_ACTIVITY_LEDGER_METADATA_OBJECT',
  `jsonb_typeof("metadata") = 'object'`,
)
@Check(
  'CHK_ACTIVITY_LEDGER_ARTIFACT_REFS_ARRAY',
  `jsonb_typeof("artifactReferences") = 'array'`,
)
export class ActivityLedgerEventEntity {
  @PrimaryGeneratedColumn('uuid')
  eventId: string;

  @Column({ type: 'varchar' })
  eventType: string;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  recordedAt: Date;

  // Until OmniSaar introduces a persisted Installation/Instance entity, callers
  // may deliberately omit instanceId. The event envelope still represents that
  // absence explicitly rather than inventing a deployment identifier.
  @Column({ type: 'varchar', nullable: true })
  instanceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  workspaceId: string | null;

  @Column({ type: 'varchar' })
  actorType: ActivityLedgerActorType;

  @Column({ type: 'varchar', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  requesterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  membershipId: string | null;

  @Column({ type: 'varchar' })
  correlationId: string;

  @Column({ type: 'uuid', nullable: true })
  causationId: string | null;

  @Column({ type: 'varchar' })
  subjectType: string;

  @Column({ type: 'varchar', nullable: true })
  subjectId: string | null;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'varchar' })
  result: ActivityLedgerResult;

  @Column({ type: 'varchar', nullable: true })
  approvalState: string | null;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null;

  @Column({ type: 'uuid', nullable: true })
  integrationConnectionId: string | null;

  @Column({ type: 'integer', nullable: true })
  durationMs: number | null;

  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  cost: string | null;

  @Column({ type: 'integer', nullable: true })
  tokenUsage: number | null;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  artifactReferences: Array<Record<string, unknown>>;
}
