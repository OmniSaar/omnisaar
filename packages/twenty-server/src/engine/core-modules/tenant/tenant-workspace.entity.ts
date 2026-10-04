import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';

import { TenantEntity } from 'src/engine/core-modules/tenant/tenant.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';

@Entity({ name: 'tenantWorkspace', schema: 'core' })
@Index('IDX_TENANT_WORKSPACE_WORKSPACE_ID_UNIQUE', ['workspaceId'], {
  unique: true,
})
@Index('IDX_TENANT_WORKSPACE_TENANT_ID', ['tenantId'])
export class TenantWorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'tenantId',
    foreignKeyConstraintName: 'FK_TENANT_WORKSPACE_TENANT_ID',
  })
  tenant: Relation<TenantEntity>;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'workspaceId',
    foreignKeyConstraintName: 'FK_TENANT_WORKSPACE_WORKSPACE_ID',
  })
  workspace: Relation<WorkspaceEntity>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
