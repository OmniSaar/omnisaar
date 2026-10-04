import { HttpStatus, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';

import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { TenantAccessControlService } from 'src/engine/core-modules/tenant/tenant-access-control.service';
import { TenantMembershipEntity } from 'src/engine/core-modules/tenant/tenant-membership.entity';
import { TenantProvisioningService } from 'src/engine/core-modules/tenant/tenant-provisioning.service';
import { TenantWorkspaceEntity } from 'src/engine/core-modules/tenant/tenant-workspace.entity';
import { TenantEntity } from 'src/engine/core-modules/tenant/tenant.entity';
import { WorkspaceAdministrationGrantEntity } from 'src/engine/core-modules/tenant/workspace-administration-grant.entity';
import { WorkspaceAdministrationService } from 'src/engine/core-modules/tenant/workspace-administration.service';
import { CustomException } from 'src/utils/custom-exception';

export enum TenantContextExceptionCode {
  TENANT_SCOPE_NOT_FOUND = 'TENANT_SCOPE_NOT_FOUND',
  WORKSPACE_TENANT_MISMATCH = 'WORKSPACE_TENANT_MISMATCH',
}

const getTenantContextExceptionUserFriendlyMessage = (
  code: TenantContextExceptionCode,
): MessageDescriptor => {
  switch (code) {
    case TenantContextExceptionCode.TENANT_SCOPE_NOT_FOUND:
      return msg`This workspace is not assigned to an organization.`;
    case TenantContextExceptionCode.WORKSPACE_TENANT_MISMATCH:
      return msg`This workspace does not belong to this organization.`;
    default:
      assertUnreachable(code);
  }
};

export class TenantContextException extends CustomException<TenantContextExceptionCode> {
  constructor(
    message: string,
    code: TenantContextExceptionCode,
    statusCode: number,
  ) {
    super(message, code, {
      statusCode,
      userFriendlyMessage: getTenantContextExceptionUserFriendlyMessage(code),
    });
  }
}

@Injectable()
export class TenantContextService {
  constructor(
    @InjectRepository(TenantWorkspaceEntity)
    private readonly tenantWorkspaceRepository: Repository<TenantWorkspaceEntity>,
  ) {}

  async resolveTenantIdForWorkspace(workspaceId: string): Promise<string> {
    const tenantWorkspace = await this.tenantWorkspaceRepository.findOne({
      select: {
        tenantId: true,
      },
      where: {
        workspaceId,
      },
    });

    if (!tenantWorkspace) {
      throw new TenantContextException(
        `No tenant scope found for workspace ${workspaceId}`,
        TenantContextExceptionCode.TENANT_SCOPE_NOT_FOUND,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return tenantWorkspace.tenantId;
  }

  async assertWorkspaceBelongsToTenant({
    tenantId,
    workspaceId,
  }: {
    tenantId: string;
    workspaceId: string;
  }): Promise<void> {
    const tenantWorkspace = await this.tenantWorkspaceRepository.findOne({
      select: {
        id: true,
      },
      where: {
        tenantId,
        workspaceId,
      },
    });

    if (!tenantWorkspace) {
      throw new TenantContextException(
        `Workspace ${workspaceId} does not belong to tenant ${tenantId}`,
        TenantContextExceptionCode.WORKSPACE_TENANT_MISMATCH,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async getWorkspaceIdsForTenant(tenantId: string): Promise<string[]> {
    const tenantWorkspaces = await this.tenantWorkspaceRepository.find({
      select: {
        workspaceId: true,
      },
      where: {
        tenantId,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    return tenantWorkspaces.map(({ workspaceId }) => workspaceId);
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      TenantWorkspaceEntity,
      TenantMembershipEntity,
      WorkspaceAdministrationGrantEntity,
    ]),
  ],
  providers: [
    TenantContextService,
    TenantAccessControlService,
    WorkspaceAdministrationService,
    TenantProvisioningService,
  ],
  exports: [
    TenantContextService,
    TenantAccessControlService,
    WorkspaceAdministrationService,
    TenantProvisioningService,
  ],
})
export class TenantModule {}
