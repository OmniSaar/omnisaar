import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  PermissionsException,
  PermissionsExceptionCode,
  PermissionsExceptionMessage,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type CreateRoleInput } from 'src/engine/metadata-modules/role/dtos/create-role.input';
import { type RoleDTO } from 'src/engine/metadata-modules/role/dtos/role.dto';
import { type UpdateRoleInput } from 'src/engine/metadata-modules/role/dtos/update-role.input';
import { type RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RoleService } from 'src/engine/metadata-modules/role/role.service';
import { type UpsertFieldPermissionsInput } from 'src/engine/metadata-modules/object-permission/dtos/upsert-field-permissions.input';
import { type UpsertObjectPermissionsInput } from 'src/engine/metadata-modules/object-permission/dtos/upsert-object-permissions.input';
import { type UpsertPermissionFlagsInput } from 'src/engine/metadata-modules/role-permission-flag/dtos/upsert-permission-flags.input';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { assertRoleWithinDelegationCeilingOrThrow } from 'src/engine/metadata-modules/user-role/utils/assert-role-within-delegation-ceiling.util';

type RoleLike = Pick<
  RoleDTO,
  | 'id'
  | 'canUpdateAllSettings'
  | 'canAccessAllTools'
  | 'canReadAllObjectRecords'
  | 'canUpdateAllObjectRecords'
  | 'canSoftDeleteAllObjectRecords'
  | 'canDestroyAllObjectRecords'
> &
  Partial<
    Pick<
      RoleDTO,
      | 'permissionFlags'
      | 'objectPermissions'
      | 'fieldPermissions'
      | 'rowLevelPermissionPredicates'
      | 'rowLevelPermissionPredicateGroups'
    >
  >;

const asDelegationRole = (role: RoleLike): RoleEntity =>
  ({
    id: role.id,
    canUpdateAllSettings: role.canUpdateAllSettings,
    canAccessAllTools: role.canAccessAllTools,
    canReadAllObjectRecords: role.canReadAllObjectRecords,
    canUpdateAllObjectRecords: role.canUpdateAllObjectRecords,
    canSoftDeleteAllObjectRecords: role.canSoftDeleteAllObjectRecords,
    canDestroyAllObjectRecords: role.canDestroyAllObjectRecords,
    rolePermissionFlags: (role.permissionFlags ?? []).map(({ flag }) => ({
      permissionFlagId: flag,
    })),
    objectPermissions: role.objectPermissions ?? [],
    fieldPermissions: role.fieldPermissions ?? [],
    rowLevelPermissionPredicates: role.rowLevelPermissionPredicates ?? [],
    rowLevelPermissionPredicateGroups:
      role.rowLevelPermissionPredicateGroups ?? [],
  }) as unknown as RoleEntity;

const denyRowLevelMutation = (): never => {
  throw new PermissionsException(
    'Row-level permission mutation requires a fully privileged workspace administrator during P0',
    PermissionsExceptionCode.PERMISSION_DENIED,
    {
      userFriendlyMessage: msg`Only a fully privileged workspace administrator can change row-level access rules right now.`,
    },
  );
};

const getRequiredRoleOrThrow = async ({
  roleId,
  roleService,
  workspaceId,
}: {
  roleId: string;
  roleService: RoleService;
  workspaceId: string;
}): Promise<RoleDTO> => {
  const role = await roleService.getRoleById(roleId, workspaceId);

  if (!isDefined(role)) {
    throw new PermissionsException(
      PermissionsExceptionMessage.ROLE_NOT_FOUND,
      PermissionsExceptionCode.ROLE_NOT_FOUND,
    );
  }

  return role;
};

const projectObjectPermissions = ({
  input,
  targetRole,
}: {
  input: UpsertObjectPermissionsInput;
  targetRole: RoleDTO;
}): RoleDTO => {
  const byObjectMetadataId = new Map(
    (targetRole.objectPermissions ?? []).map((permission) => [
      permission.objectMetadataId,
      permission,
    ]),
  );

  for (const permission of input.objectPermissions) {
    const current = byObjectMetadataId.get(permission.objectMetadataId);

    byObjectMetadataId.set(permission.objectMetadataId, {
      ...(current ?? ({} as NonNullable<RoleDTO['objectPermissions']>[number])),
      objectMetadataId: permission.objectMetadataId,
      roleId: targetRole.id,
      canReadObjectRecords:
        permission.canReadObjectRecords ?? current?.canReadObjectRecords ?? null,
      canUpdateObjectRecords:
        permission.canUpdateObjectRecords ??
        current?.canUpdateObjectRecords ??
        null,
      canSoftDeleteObjectRecords:
        permission.canSoftDeleteObjectRecords ??
        current?.canSoftDeleteObjectRecords ??
        null,
      canDestroyObjectRecords:
        permission.canDestroyObjectRecords ??
        current?.canDestroyObjectRecords ??
        null,
    });
  }

  return {
    ...targetRole,
    id: `${targetRole.id}:candidate`,
    objectPermissions: [...byObjectMetadataId.values()],
  };
};

const projectFieldPermissions = ({
  input,
  targetRole,
}: {
  input: UpsertFieldPermissionsInput;
  targetRole: RoleDTO;
}): RoleDTO => {
  const byFieldMetadataId = new Map(
    (targetRole.fieldPermissions ?? []).map((permission) => [
      permission.fieldMetadataId,
      permission,
    ]),
  );

  for (const permission of input.fieldPermissions) {
    const current = byFieldMetadataId.get(permission.fieldMetadataId);

    byFieldMetadataId.set(permission.fieldMetadataId, {
      ...(current ?? ({} as NonNullable<RoleDTO['fieldPermissions']>[number])),
      objectMetadataId: permission.objectMetadataId,
      fieldMetadataId: permission.fieldMetadataId,
      roleId: targetRole.id,
      canReadFieldValue:
        permission.canReadFieldValue === undefined
          ? (current?.canReadFieldValue ?? null)
          : permission.canReadFieldValue,
      canUpdateFieldValue:
        permission.canUpdateFieldValue === undefined
          ? (current?.canUpdateFieldValue ?? null)
          : permission.canUpdateFieldValue,
    });
  }

  return {
    ...targetRole,
    id: `${targetRole.id}:candidate`,
    fieldPermissions: [...byFieldMetadataId.values()],
  };
};

export const RoleMutationDelegationGuard = (): Type<CanActivate> => {
  @Injectable()
  class RoleMutationDelegationMixin implements CanActivate {
    constructor(
      private readonly roleService: RoleService,
      private readonly userRoleService: UserRoleService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const ctx = GqlExecutionContext.create(context);
      const request = ctx.getContext().req;
      const actingUserWorkspaceId = request.userWorkspaceId as
        | string
        | undefined;

      // Preserve trusted system/API-key/application flows. Human workspace
      // mutations are the delegation boundary enforced here.
      if (!isDefined(actingUserWorkspaceId)) {
        return true;
      }

      const workspaceId = request.workspace.id as string;
      const fieldName = ctx.getInfo().fieldName as string;
      const args = ctx.getArgs() as Record<string, unknown>;

      const actorRoleId = await this.userRoleService.getRoleIdForUserWorkspace({
        workspaceId,
        userWorkspaceId: actingUserWorkspaceId,
      });
      const actorRole = await getRequiredRoleOrThrow({
        roleId: actorRoleId,
        roleService: this.roleService,
        workspaceId,
      });

      const assertProjectedRole = (targetRole: RoleLike) =>
        assertRoleWithinDelegationCeilingOrThrow({
          actorRole: asDelegationRole(actorRole),
          targetRole: asDelegationRole(targetRole),
        });

      if (fieldName === 'createOneRole') {
        const input = args.createRoleInput as CreateRoleInput;

        assertProjectedRole({
          id: 'role-create-candidate',
          canUpdateAllSettings: input.canUpdateAllSettings ?? false,
          canAccessAllTools: input.canAccessAllTools ?? false,
          canReadAllObjectRecords: input.canReadAllObjectRecords ?? false,
          canUpdateAllObjectRecords: input.canUpdateAllObjectRecords ?? false,
          canSoftDeleteAllObjectRecords:
            input.canSoftDeleteAllObjectRecords ?? false,
          canDestroyAllObjectRecords: input.canDestroyAllObjectRecords ?? false,
          permissionFlags: [],
          objectPermissions: [],
          fieldPermissions: [],
        });

        return true;
      }

      if (fieldName === 'updateOneRole') {
        const input = args.updateRoleInput as UpdateRoleInput;
        const currentRole = await getRequiredRoleOrThrow({
          roleId: input.id,
          roleService: this.roleService,
          workspaceId,
        });

        assertProjectedRole({
          ...currentRole,
          ...input.update,
          id: `${currentRole.id}:candidate`,
        });

        return true;
      }

      if (fieldName === 'upsertPermissionFlags') {
        const input = args.upsertPermissionFlagsInput as UpsertPermissionFlagsInput;
        const targetRole = await getRequiredRoleOrThrow({
          roleId: input.roleId,
          roleService: this.roleService,
          workspaceId,
        });

        assertProjectedRole({
          ...targetRole,
          id: `${targetRole.id}:candidate`,
          permissionFlags: input.permissionFlagKeys.map((flag, index) => ({
            id: `candidate-${index}`,
            roleId: targetRole.id,
            flag,
          })),
        });

        return true;
      }

      if (fieldName === 'upsertObjectPermissions') {
        const input = args.upsertObjectPermissionsInput as UpsertObjectPermissionsInput;
        const targetRole = await getRequiredRoleOrThrow({
          roleId: input.roleId,
          roleService: this.roleService,
          workspaceId,
        });

        assertProjectedRole(projectObjectPermissions({ input, targetRole }));

        return true;
      }

      if (fieldName === 'upsertFieldPermissions') {
        const input = args.upsertFieldPermissionsInput as UpsertFieldPermissionsInput;
        const targetRole = await getRequiredRoleOrThrow({
          roleId: input.roleId,
          roleService: this.roleService,
          workspaceId,
        });

        assertProjectedRole(projectFieldPermissions({ input, targetRole }));

        return true;
      }

      if (fieldName === 'upsertRowLevelPermissionPredicates') {
        const fullyPrivilegedForRecords =
          actorRole.canUpdateAllSettings &&
          actorRole.canReadAllObjectRecords &&
          actorRole.canUpdateAllObjectRecords &&
          actorRole.canSoftDeleteAllObjectRecords &&
          actorRole.canDestroyAllObjectRecords;

        if (!fullyPrivilegedForRecords) {
          denyRowLevelMutation();
        }

        return true;
      }

      if (
        fieldName === 'updateWorkspaceMemberRole' ||
        fieldName === 'assignRoleToAgent'
      ) {
        const roleId = args.roleId as string;
        const targetRole = await getRequiredRoleOrThrow({
          roleId,
          roleService: this.roleService,
          workspaceId,
        });

        assertProjectedRole(targetRole);
      }

      return true;
    }
  }

  return mixin(RoleMutationDelegationMixin);
};
