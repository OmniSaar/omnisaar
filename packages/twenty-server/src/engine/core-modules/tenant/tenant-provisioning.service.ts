import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource, Repository } from 'typeorm';

import { TenantAccessControlService } from 'src/engine/core-modules/tenant/tenant-access-control.service';
import {
  TenantMembershipEntity,
  type TenantAdministrationCapability,
  type TenantMembershipRole,
} from 'src/engine/core-modules/tenant/tenant-membership.entity';
import {
  WorkspaceAdministrationGrantEntity,
  type WorkspaceAdministrationCapability,
} from 'src/engine/core-modules/tenant/workspace-administration-grant.entity';
import { WorkspaceAdministrationService } from 'src/engine/core-modules/tenant/workspace-administration.service';

@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TenantMembershipEntity)
    private readonly tenantMembershipRepository: Repository<TenantMembershipEntity>,
    @InjectRepository(WorkspaceAdministrationGrantEntity)
    private readonly workspaceAdministrationGrantRepository: Repository<WorkspaceAdministrationGrantEntity>,
    private readonly tenantAccessControlService: TenantAccessControlService,
    private readonly workspaceAdministrationService: WorkspaceAdministrationService,
  ) {}

  /**
   * Trusted installation/bootstrap path only. This method intentionally does not
   * accept an actor because it is for establishing the first owner before normal
   * delegated administration is possible.
   *
   * The partial unique index on tenantMembership guarantees that two concurrent
   * bootstrap attempts cannot produce two active owners.
   */
  async bootstrapFirstOwner({
    tenantId,
    userId,
  }: {
    tenantId: string;
    userId: string;
  }): Promise<TenantMembershipEntity> {
    return this.dataSource.transaction(async (manager) => {
      const membershipRepository = manager.getRepository(TenantMembershipEntity);

      const membership = await membershipRepository.findOne({
        where: { tenantId, userId },
      });

      if (!membership || membership.status !== 'active') {
        throw new ConflictException(
          'The first owner must already be an active member of this organization.',
        );
      }

      const existingOwner = await membershipRepository.findOne({
        where: { tenantId, role: 'owner', status: 'active' },
      });

      if (existingOwner) {
        if (existingOwner.userId === userId) {
          return existingOwner;
        }

        throw new ConflictException(
          'This organization already has an active owner.',
        );
      }

      membership.role = 'owner';
      membership.status = 'active';
      membership.administrationCapabilities = [];

      return membershipRepository.save(membership);
    });
  }

  async grantTenantMembership({
    actorUserId,
    capabilities,
    role,
    targetUserId,
    tenantId,
  }: {
    actorUserId: string;
    capabilities: TenantAdministrationCapability[];
    role: Exclude<TenantMembershipRole, 'owner'>;
    targetUserId: string;
    tenantId: string;
  }): Promise<TenantMembershipEntity> {
    await this.tenantAccessControlService.assertCanGrantMembership({
      actorUserId,
      requestedCapabilities: capabilities,
      requestedRole: role,
      tenantId,
    });

    const existingMembership = await this.tenantMembershipRepository.findOne({
      where: { tenantId, userId: targetUserId },
    });

    const membership =
      existingMembership ??
      this.tenantMembershipRepository.create({
        tenantId,
        userId: targetUserId,
      });

    membership.role = role;
    membership.status = 'active';
    membership.administrationCapabilities = role === 'member' ? [] : capabilities;

    return this.tenantMembershipRepository.save(membership);
  }

  async grantWorkspaceAdministration({
    actorUserId,
    capabilities,
    targetUserId,
    tenantId,
    workspaceId,
  }: {
    actorUserId: string;
    capabilities: WorkspaceAdministrationCapability[];
    targetUserId: string;
    tenantId: string;
    workspaceId: string;
  }): Promise<WorkspaceAdministrationGrantEntity> {
    await this.workspaceAdministrationService.assertCanGrantAdministration({
      actorUserId,
      requestedCapabilities: capabilities,
      tenantId,
      workspaceId,
    });

    const targetMembership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId: targetUserId,
      });

    const existingGrant =
      await this.workspaceAdministrationGrantRepository.findOne({
        where: {
          tenantMembershipId: targetMembership.id,
          workspaceId,
        },
      });

    const grant =
      existingGrant ??
      this.workspaceAdministrationGrantRepository.create({
        tenantMembershipId: targetMembership.id,
        workspaceId,
      });

    grant.status = 'active';
    grant.administrationCapabilities = capabilities;

    return this.workspaceAdministrationGrantRepository.save(grant);
  }
}
