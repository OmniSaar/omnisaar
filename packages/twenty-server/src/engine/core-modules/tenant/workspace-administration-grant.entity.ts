import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { TenantMembershipEntity } from 'src/engine/core-modules/tenant/tenant-membership.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

export const WORKSPACE_ADMINISTRATION_CAPABILITIES = [
  'workspace.users.manage',
  'workspace.roles.manage',
  'workspace.admins.delegate',
  'workspace.integrations.manage',
  'workspace.settings.manage',
  'workspace.agents.manage',
  'workspace.approvals.manage',
  'workspace.reports.view',
] as const;

export type WorkspaceAdministrationCapability =
  (typeof WORKSPACE_ADMINISTRATION_CAPABILITIES)[number];

@Entity({ name: 'workspaceAdministrationGrant', schema: 'core' })
@Unique('IDX_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_WORKSPACE_UNIQUE', [
  'tenantMembershipId',
  'workspaceId',
])
@Index('IDX_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_ID', ['tenantMembershipId'])
@Index('IDX_WORKSPACE_ADMIN_GRANT_WORKSPACE_ID', ['workspaceId'])
@Check(
  'CHK_WORKSPACE_ADMIN_GRANT_STATUS',
  `"status" IN ('active', 'suspended')`,
)
@Check(
  'CHK_WORKSPACE_ADMIN_GRANT_CAPABILITIES_ARRAY',
  `jsonb_typeof("administrationCapabilities") = 'array'`,
)
@Check(
  'CHK_WORKSPACE_ADMIN_GRANT_KNOWN_CAPABILITIES',
  `"administrationCapabilities" <@ '["workspace.users.manage","workspace.roles.manage","workspace.admins.delegate","workspace.integrations.manage","workspace.settings.manage","workspace.agents.manage","workspace.approvals.manage","workspace.reports.view"]'::jsonb`,
)
export class WorkspaceAdministrationGrantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantMembershipId: string;

  @ManyToOne(() => TenantMembershipEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'tenantMembershipId',
    foreignKeyConstraintName: 'FK_WORKSPACE_ADMIN_GRANT_MEMBERSHIP_ID',
  })
  tenantMembership: Relation<TenantMembershipEntity>;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'workspaceId',
    foreignKeyConstraintName: 'FK_WORKSPACE_ADMIN_GRANT_WORKSPACE_ID',
  })
  workspace: Relation<WorkspaceEntity>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  administrationCapabilities: WorkspaceAdministrationCapability[];

  @Column({ type: 'varchar', default: 'active' })
  status: 'active' | 'suspended';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
