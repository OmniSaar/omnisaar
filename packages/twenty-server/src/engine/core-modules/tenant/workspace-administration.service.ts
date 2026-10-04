import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { TenantAccessControlService } from 'src/engine/core-modules/tenant/tenant-access-control.service';
import { TenantContextService } from 'src/engine/core-modules/tenant/tenant-context.module';
import {
  WORKSPACE_ADMINISTRATION_CAPABILITIES,
  WorkspaceAdministrationGrantEntity,
  type WorkspaceAdministrationCapability,
} from 'src/engine/core-modules/tenant/workspace-administration-grant.entity';
import { CustomException } from 'src/utils/custom-exception';

export enum WorkspaceAdministrationExceptionCode {
  GRANT_NOT_FOUND = 'WORKSPACE_ADMINISTRATION_GRANT_NOT_FOUND',
  GRANT_INACTIVE = 'WORKSPACE_ADMINISTRATION_GRANT_INACTIVE',
  CAPABILITY_DENIED = 'WORKSPACE_ADMINISTRATION_CAPABILITY_DENIED',
  PRIVILEGE_ESCALATION_DENIED = 'WORKSPACE_ADMINISTRATION_PRIVILEGE_ESCALATION_DENIED',
  INVALID_CAPABILITY = 'WORKSPACE_ADMINISTRATION_INVALID_CAPABILITY',
}

export class WorkspaceAdministrationException extends CustomException<WorkspaceAdministrationExceptionCode> {}

@Injectable()
export class WorkspaceAdministrationService {
  constructor(
    @InjectRepository(WorkspaceAdministrationGrantEntity)
    private readonly workspaceAdministrationGrantRepository: Repository<WorkspaceAdministrationGrantEntity>,
    private readonly tenantContextService: TenantContextService,
    private readonly tenantAccessControlService: TenantAccessControlService,
  ) {}

  async assertCapability({
    capability,
    tenantId,
    userId,
    workspaceId,
  }: {
    capability: WorkspaceAdministrationCapability;
    tenantId: string;
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    this.assertKnownCapabilities([capability]);

    await this.tenantContextService.assertWorkspaceBelongsToTenant({
      tenantId,
      workspaceId,
    });

    const membership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId,
      });

    if (membership.role === 'owner') {
      return;
    }

    const grant = await this.workspaceAdministrationGrantRepository.findOne({
      where: {
        tenantMembershipId: membership.id,
        workspaceId,
      },
    });

    if (!grant) {
      throw new WorkspaceAdministrationException(
        `User ${userId} has no administration grant for workspace ${workspaceId}`,
        WorkspaceAdministrationExceptionCode.GRANT_NOT_FOUND,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }

    if (grant.status !== 'active') {
      throw new WorkspaceAdministrationException(
        `Workspace administration grant ${grant.id} is ${grant.status}`,
        WorkspaceAdministrationExceptionCode.GRANT_INACTIVE,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }

    if (!grant.administrationCapabilities.includes(capability)) {
      throw new WorkspaceAdministrationException(
        `User ${userId} lacks ${capability} for workspace ${workspaceId}`,
        WorkspaceAdministrationExceptionCode.CAPABILITY_DENIED,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }
  }

  async assertCanGrantAdministration({
    actorUserId,
    requestedCapabilities,
    tenantId,
    workspaceId,
  }: {
    actorUserId: string;
    requestedCapabilities: WorkspaceAdministrationCapability[];
    tenantId: string;
    workspaceId: string;
  }): Promise<void> {
    this.assertKnownCapabilities(requestedCapabilities);

    await this.tenantContextService.assertWorkspaceBelongsToTenant({
      tenantId,
      workspaceId,
    });

    const actorMembership =
      await this.tenantAccessControlService.getActiveMembershipOrThrow({
        tenantId,
        userId: actorUserId,
      });

    if (actorMembership.role === 'owner') {
      return;
    }

    const actorGrant =
      await this.workspaceAdministrationGrantRepository.findOne({
        where: {
          tenantMembershipId: actorMembership.id,
          workspaceId,
        },
      });

    if (!actorGrant || actorGrant.status !== 'active') {
      throw new WorkspaceAdministrationException(
        `User ${actorUserId} cannot delegate workspace administration for ${workspaceId}`,
        WorkspaceAdministrationExceptionCode.CAPABILITY_DENIED,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }

    const actorCapabilities = new Set(
      actorGrant.administrationCapabilities,
    );

    if (
      !actorCapabilities.has('workspace.users.manage') ||
      !actorCapabilities.has('workspace.admins.delegate')
    ) {
      throw new WorkspaceAdministrationException(
        `User ${actorUserId} cannot delegate workspace administrators`,
        WorkspaceAdministrationExceptionCode.CAPABILITY_DENIED,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }

    const escalatedCapability = requestedCapabilities.find(
      (capability) => !actorCapabilities.has(capability),
    );

    if (escalatedCapability) {
      throw new WorkspaceAdministrationException(
        `User ${actorUserId} cannot grant workspace capability ${escalatedCapability}`,
        WorkspaceAdministrationExceptionCode.PRIVILEGE_ESCALATION_DENIED,
        { statusCode: HttpStatus.FORBIDDEN },
      );
    }
  }

  private assertKnownCapabilities(
    capabilities: WorkspaceAdministrationCapability[],
  ): void {
    const knownCapabilities = new Set<string>(
      WORKSPACE_ADMINISTRATION_CAPABILITIES,
    );
    const invalidCapability = capabilities.find(
      (capability) => !knownCapabilities.has(capability),
    );

    if (invalidCapability) {
      throw new WorkspaceAdministrationException(
        `Unknown workspace administration capability: ${invalidCapability}`,
        WorkspaceAdministrationExceptionCode.INVALID_CAPABILITY,
        { statusCode: HttpStatus.BAD_REQUEST },
      );
    }
  }
}
