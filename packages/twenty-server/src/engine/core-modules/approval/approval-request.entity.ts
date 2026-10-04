import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const APPROVAL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'denied',
  'expired',
  'cancelled',
] as const;

export type ApprovalRequestStatus =
  (typeof APPROVAL_REQUEST_STATUSES)[number];

export const APPROVAL_REQUESTER_TYPES = [
  'human',
  'agent',
  'automation',
  'system',
] as const;

export type ApprovalRequesterType =
  (typeof APPROVAL_REQUESTER_TYPES)[number];

@Entity({ name: 'approvalRequest', schema: 'core' })
@Index('IDX_APPROVAL_REQUEST_TENANT_WORKSPACE_STATUS_CREATED_AT', [
  'tenantId',
  'workspaceId',
  'status',
  'createdAt',
])
@Index('IDX_APPROVAL_REQUEST_CORRELATION_ID', ['correlationId'])
@Index('IDX_APPROVAL_REQUEST_ACTION_HASH', ['actionHash'])
@Index('IDX_APPROVAL_REQUEST_AGENT_TURN_ID', ['agentTurnId'])
@Check(
  'CHK_APPROVAL_REQUEST_STATUS',
  `"status" IN ('pending', 'approved', 'denied', 'expired', 'cancelled')`,
)
@Check(
  'CHK_APPROVAL_REQUESTER_TYPE',
  `"requestedByPrincipalType" IN ('human', 'agent', 'automation', 'system')`,
)
@Check('CHK_APPROVAL_ACTION_HASH_LENGTH', `length("actionHash") = 64`)
@Check(
  'CHK_APPROVAL_ACTION_PREVIEW_OBJECT',
  `jsonb_typeof("actionPreview") = 'object'`,
)
@Check(
  'CHK_APPROVAL_POLICY_SNAPSHOT_OBJECT',
  `jsonb_typeof("policySnapshot") = 'object'`,
)
@Check(
  'CHK_APPROVAL_EXPIRY_AFTER_CREATION',
  `"expiresAt" > "createdAt"`,
)
@Check(
  'CHK_APPROVAL_DECISION_FIELDS',
  `"status" NOT IN ('approved', 'denied') OR ("decidedAt" IS NOT NULL AND "decidedByPrincipalId" IS NOT NULL)`,
)
@Check(
  'CHK_APPROVAL_CONSUMPTION_FIELDS',
  `(("consumedAt" IS NULL AND "executionId" IS NULL) OR ("consumedAt" IS NOT NULL AND "executionId" IS NOT NULL AND "status" = 'approved'))`,
)
export class ApprovalRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid', nullable: true })
  agentTurnId: string | null;

  @Column({ type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'varchar' })
  requestedByPrincipalType: ApprovalRequesterType;

  @Column({ type: 'varchar' })
  requestedByPrincipalId: string;

  @Column({ type: 'varchar', nullable: true })
  requesterId: string | null;

  @Column({ type: 'uuid', nullable: true })
  membershipId: string | null;

  @Column({ type: 'varchar' })
  actionType: string;

  @Column({ type: 'varchar', nullable: true })
  toolName: string | null;

  @Column({ type: 'varchar', length: 64 })
  actionHash: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  actionPreview: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  policySnapshot: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  requiredApproverRoleId: string | null;

  @Column({ type: 'varchar', default: 'pending' })
  status: ApprovalRequestStatus;

  @Column({ type: 'varchar', nullable: true })
  decidedByPrincipalId: string | null;

  @Column({ type: 'text', nullable: true })
  decisionReason: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  executionId: string | null;

  @Column({ type: 'varchar' })
  correlationId: string;

  @Column({ type: 'varchar', nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
