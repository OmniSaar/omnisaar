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

import { TenantEntity } from 'src/engine/core-modules/tenant/tenant.entity';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';

export const TENANT_MEMBERSHIP_ROLES = ['owner', 'admin', 'member'] as const;

export type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number];

export const TENANT_ADMINISTRATION_CAPABILITIES = [
  'administration.users.manage',
  'administration.roles.manage',
  'administration.admins.delegate',
  'administration.workspaces.manage',
  'administration.integrations.manage',
  'administration.secrets.manage',
  'administration.agents.manage',
  'administration.approvals.manage',
  'reports.crossWorkspace.view',
] as const;

export type TenantAdministrationCapability =
  (typeof TENANT_ADMINISTRATION_CAPABILITIES)[number];

export const TENANT_MEMBERSHIP_STATUSES = [
  'active',
  'suspended',
] as const;

export type TenantMembershipStatus =
  (typeof TENANT_MEMBERSHIP_STATUSES)[number];

@Entity({ name: 'tenantMembership', schema: 'core' })
@Unique('IDX_TENANT_MEMBERSHIP_TENANT_USER_UNIQUE', ['tenantId', 'userId'])
@Index('IDX_TENANT_MEMBERSHIP_TENANT_ID', ['tenantId'])
@Index('IDX_TENANT_MEMBERSHIP_USER_ID', ['userId'])
@Index('IDX_TENANT_MEMBERSHIP_ONE_ACTIVE_OWNER', ['tenantId'], {
  unique: true,
  where: `"role" = 'owner' AND "status" = 'active'`,
})
@Check('CHK_TENANT_MEMBERSHIP_ROLE', `"role" IN ('owner', 'admin', 'member')`)
@Check(
  'CHK_TENANT_MEMBERSHIP_STATUS',
  `"status" IN ('active', 'suspended')`,
)
@Check(
  'CHK_TENANT_ADMIN_CAPABILITIES_ARRAY',
  `jsonb_typeof("administrationCapabilities") = 'array'`,
)
@Check(
  'CHK_TENANT_MEMBER_HAS_NO_ADMIN_CAPABILITIES',
  `"role" <> 'member' OR jsonb_array_length("administrationCapabilities") = 0`,
)
export class TenantMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'tenantId',
    foreignKeyConstraintName: 'FK_TENANT_MEMBERSHIP_TENANT_ID',
  })
  tenant: Relation<TenantEntity>;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_TENANT_MEMBERSHIP_USER_ID',
  })
  user: Relation<UserEntity>;

  @Column({ type: 'varchar', default: 'member' })
  role: TenantMembershipRole;

  @Column({ type: 'varchar', default: 'active' })
  status: TenantMembershipStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  administrationCapabilities: TenantAdministrationCapability[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
