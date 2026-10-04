import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { ActivityLedgerService } from 'src/engine/core-modules/activity-ledger/activity-ledger.service';
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
    private readonly activityLedgerService: ActivityLedgerService,
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
    correlationId = randomUUID(),
    tenantId,
    userId,
  }: {
    correlationId?: string;
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

      if (existingOwner && existingOwner.userId !== userId) {
        throw new ConflictException(
          'This organization already has an active owner.',
        );
      }

      if (!existingOwner) {
        membership.role = 'owner';
        membership.status = 'active';
        membership.administrationCapabilities = [];
        await membershipRepository.save(membership);
      }

      const owner = existingOwner ?? membership;

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: 'security.tenant_owner_bootstrapped',
        tenantId,
        actorType: 'system',
        correlationId,
        subjectType: 'tenantMembership',
        subjectId: owner.id,
        action: 'tenant.owner.bootstrap',
        result: 'success',
        idempotencyKey: `tenant-owner-bootstrap:${tenantId}:${userId}`,
        metadata: {
          targetUserId: userId,
          role: 'owner',
        },
      });

      return owner;
    });
  }

  async grantTenantMembership({
    actorUserId,
    capabilities,
    correlationId = randomUUID(),
    idempotencyKey,
    role,
    targetUserId,
    tenantId,
  }: {
    actorUserId: string;
    capabilities: TenantAdministrationCapability[];
    correlationId?: string;
    idempotencyKey?: string;
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

    const actorMembership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId: actorUserId,
      });

    return this.dataSource.transaction(async (manager) => {
      const membershipRepository = manager.getRepository(TenantMembershipEntity);
      const existingMembership = await membershipRepository.findOne({
        where: { tenantId, userId: targetUserId },
      });

      if (existingMembership?.role === 'owner') {
        throw new ConflictException(
          'Owner membership can only change through an explicit ownership transfer.',
        );
      }

      const previousRole = existingMembership?.role ?? null;
      const previousCapabilities =
        existingMembership?.administrationCapabilities ?? [];
      const membership =
        existingMembership ??
        membershipRepository.create({
          tenantId,
          userId: targetUserId,
        });

      membership.role = role;
      membership.status = 'active';
      membership.administrationCapabilities =
        role === 'member' ? [] : capabilities;

      const savedMembership = await membershipRepository.save(membership);

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: existingMembership
          ? 'security.tenant_membership_updated'
          : 'security.tenant_membership_granted',
        tenantId,
        actorType: 'human',
        actorId: actorUserId,
        requesterId: actorUserId,
        membershipId: actorMembership.id,
        correlationId,
        subjectType: 'tenantMembership',
        subjectId: savedMembership.id,
        action: 'tenant.membership.grant',
        result: 'success',
        idempotencyKey: idempotencyKey ?? null,
        metadata: {
          targetUserId,
          previousRole,
          role,
          previousCapabilities,
          administrationCapabilities:
            savedMembership.administrationCapabilities,
        },
      });

      return savedMembership;
    });
  }

  async grantWorkspaceAdministration({
    actorUserId,
    capabilities,
    correlationId = randomUUID(),
    idempotencyKey,
    targetUserId,
    tenantId,
    workspaceId,
  }: {
    actorUserId: string;
    capabilities: WorkspaceAdministrationCapability[];
    correlationId?: string;
    idempotencyKey?: string;
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

    const actorMembership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId: actorUserId,
      });
    const targetMembership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId: targetUserId,
      });

    return this.dataSource.transaction(async (manager) => {
      const grantRepository = manager.getRepository(
        WorkspaceAdministrationGrantEntity,
      );
      const existingGrant = await grantRepository.findOne({
        where: {
          tenantMembershipId: targetMembership.id,
          workspaceId,
        },
      });
      const previousCapabilities =
        existingGrant?.administrationCapabilities ?? [];
      const grant =
        existingGrant ??
        grantRepository.create({
          tenantMembershipId: targetMembership.id,
          workspaceId,
        });

      grant.status = 'active';
      grant.administrationCapabilities = capabilities;

      const savedGrant = await grantRepository.save(grant);

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: existingGrant
          ? 'security.workspace_admin_updated'
          : 'security.workspace_admin_granted',
        tenantId,
        workspaceId,
        actorType: 'human',
        actorId: actorUserId,
        requesterId: actorUserId,
        membershipId: actorMembership.id,
        correlationId,
        subjectType: 'workspaceAdministrationGrant',
        subjectId: savedGrant.id,
        action: 'workspace.administration.grant',
        result: 'success',
        idempotencyKey: idempotencyKey ?? null,
        metadata: {
          targetUserId,
          targetTenantMembershipId: targetMembership.id,
          previousCapabilities,
          administrationCapabilities:
            savedGrant.administrationCapabilities,
        },
      });

      return savedGrant;
    });
  }
}
