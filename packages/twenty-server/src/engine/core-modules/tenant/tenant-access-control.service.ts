import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { assertUnreachable } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import {
  TENANT_ADMINISTRATION_CAPABILITIES,
  TenantMembershipEntity,
  type TenantAdministrationCapability,
  type TenantMembershipRole,
} from 'src/engine/core-modules/tenant/tenant-membership.entity';
import { CustomException } from 'src/utils/custom-exception';

export enum TenantAccessControlExceptionCode {
  MEMBERSHIP_NOT_FOUND = 'TENANT_MEMBERSHIP_NOT_FOUND',
  MEMBERSHIP_INACTIVE = 'TENANT_MEMBERSHIP_INACTIVE',
  CAPABILITY_DENIED = 'TENANT_CAPABILITY_DENIED',
  PRIVILEGE_ESCALATION_DENIED = 'TENANT_PRIVILEGE_ESCALATION_DENIED',
  INVALID_CAPABILITY = 'TENANT_INVALID_CAPABILITY',
}

const getTenantAccessControlExceptionUserFriendlyMessage = (
  code: TenantAccessControlExceptionCode,
): MessageDescriptor => {
  switch (code) {
    case TenantAccessControlExceptionCode.MEMBERSHIP_NOT_FOUND:
      return msg`You are not a member of this organization.`;
    case TenantAccessControlExceptionCode.MEMBERSHIP_INACTIVE:
      return msg`Your organization membership is not active.`;
    case TenantAccessControlExceptionCode.CAPABILITY_DENIED:
      return msg`You do not have permission to perform this organization action.`;
    case TenantAccessControlExceptionCode.PRIVILEGE_ESCALATION_DENIED:
      return msg`You cannot grant permissions above your own access level.`;
    case TenantAccessControlExceptionCode.INVALID_CAPABILITY:
      return msg`One or more requested permissions are not valid.`;
    default:
      assertUnreachable(code);
  }
};

export class TenantAccessControlException extends CustomException<TenantAccessControlExceptionCode> {
  constructor(
    message: string,
    code: TenantAccessControlExceptionCode,
    statusCode: number,
  ) {
    super(message, code, {
      statusCode,
      userFriendlyMessage: getTenantAccessControlExceptionUserFriendlyMessage(code),
    });
  }
}

@Injectable()
export class TenantAccessControlService {
  constructor(
    @InjectRepository(TenantMembershipEntity)
    private readonly tenantMembershipRepository: Repository<TenantMembershipEntity>,
  ) {}

  async getActiveMembershipOrThrow({
    tenantId,
    userId,
  }: {
    tenantId: string;
    userId: string;
  }): Promise<TenantMembershipEntity> {
    const membership = await this.tenantMembershipRepository.findOne({
      where: {
        tenantId,
        userId,
      },
    });

    if (!membership) {
      throw new TenantAccessControlException(
        `User ${userId} has no membership in tenant ${tenantId}`,
        TenantAccessControlExceptionCode.MEMBERSHIP_NOT_FOUND,
        HttpStatus.FORBIDDEN,
      );
    }

    if (membership.status !== 'active') {
      throw new TenantAccessControlException(
        `User ${userId} membership in tenant ${tenantId} is ${membership.status}`,
        TenantAccessControlExceptionCode.MEMBERSHIP_INACTIVE,
        HttpStatus.FORBIDDEN,
      );
    }

    return membership;
  }

  async assertCapability({
    capability,
    tenantId,
    userId,
  }: {
    capability: TenantAdministrationCapability;
    tenantId: string;
    userId: string;
  }): Promise<void> {
    const membership = await this.getActiveMembershipOrThrow({
      tenantId,
      userId,
    });

    if (membership.role === 'owner') {
      return;
    }

    if (!membership.administrationCapabilities.includes(capability)) {
      throw new TenantAccessControlException(
        `User ${userId} lacks ${capability} in tenant ${tenantId}`,
        TenantAccessControlExceptionCode.CAPABILITY_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async assertCanGrantMembership({
    actorUserId,
    requestedCapabilities,
    requestedRole,
    tenantId,
  }: {
    actorUserId: string;
    requestedCapabilities: TenantAdministrationCapability[];
    requestedRole: TenantMembershipRole;
    tenantId: string;
  }): Promise<void> {
    this.assertKnownCapabilities(requestedCapabilities);

    if (requestedRole === 'owner') {
      throw new TenantAccessControlException(
        'Owner assignment is reserved for first-owner bootstrap or explicit ownership transfer',
        TenantAccessControlExceptionCode.PRIVILEGE_ESCALATION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (requestedRole === 'member' && requestedCapabilities.length > 0) {
      throw new TenantAccessControlException(
        'Ordinary tenant members cannot receive administration capabilities',
        TenantAccessControlExceptionCode.PRIVILEGE_ESCALATION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    const actorMembership = await this.getActiveMembershipOrThrow({
      tenantId,
      userId: actorUserId,
    });

    if (actorMembership.role === 'owner') {
      return;
    }

    if (actorMembership.role !== 'admin') {
      throw new TenantAccessControlException(
        `User ${actorUserId} cannot grant tenant memberships`,
        TenantAccessControlExceptionCode.CAPABILITY_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      !actorMembership.administrationCapabilities.includes(
        'administration.users.manage',
      )
    ) {
      throw new TenantAccessControlException(
        `User ${actorUserId} cannot manage tenant users`,
        TenantAccessControlExceptionCode.CAPABILITY_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (
      requestedRole === 'admin' &&
      !actorMembership.administrationCapabilities.includes(
        'administration.admins.delegate',
      )
    ) {
      throw new TenantAccessControlException(
        `User ${actorUserId} cannot delegate tenant administrators`,
        TenantAccessControlExceptionCode.CAPABILITY_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }

    const actorCapabilities = new Set(
      actorMembership.administrationCapabilities,
    );
    const escalatedCapability = requestedCapabilities.find(
      (capability) => !actorCapabilities.has(capability),
    );

    if (escalatedCapability) {
      throw new TenantAccessControlException(
        `User ${actorUserId} cannot grant capability ${escalatedCapability}`,
        TenantAccessControlExceptionCode.PRIVILEGE_ESCALATION_DENIED,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private assertKnownCapabilities(
    capabilities: TenantAdministrationCapability[],
  ): void {
    const knownCapabilities = new Set<string>(
      TENANT_ADMINISTRATION_CAPABILITIES,
    );
    const invalidCapability = capabilities.find(
      (capability) => !knownCapabilities.has(capability),
    );

    if (invalidCapability) {
      throw new TenantAccessControlException(
        `Unknown tenant administration capability: ${invalidCapability}`,
        TenantAccessControlExceptionCode.INVALID_CAPABILITY,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
