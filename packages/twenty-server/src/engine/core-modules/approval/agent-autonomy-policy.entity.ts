import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const AGENT_AUTONOMY_DECISIONS = [
  'allow',
  'approval_required',
  'deny',
] as const;

export type AgentAutonomyDecision =
  (typeof AGENT_AUTONOMY_DECISIONS)[number];

@Entity({ name: 'agentAutonomyPolicy', schema: 'core' })
@Index(
  'IDX_AGENT_AUTONOMY_POLICY_SCOPE_ACTION_UNIQUE',
  ['tenantId', 'workspaceId', 'agentId', 'actionPrefix'],
  { unique: true },
)
@Index('IDX_AGENT_AUTONOMY_POLICY_LOOKUP', [
  'tenantId',
  'workspaceId',
  'agentId',
  'enabled',
])
@Check(
  'CHK_AGENT_AUTONOMY_POLICY_DECISION',
  `"decision" IN ('allow', 'approval_required', 'deny')`,
)
@Check(
  'CHK_AGENT_AUTONOMY_POLICY_ACTION_PREFIX',
  `length(trim("actionPrefix")) > 0`,
)
export class AgentAutonomyPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'varchar' })
  actionPrefix: string;

  @Column({ type: 'varchar' })
  decision: AgentAutonomyDecision;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar' })
  createdByPrincipalId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
