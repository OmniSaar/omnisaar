import { msg } from '@lingui/core/macro';

import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type RoleEntity } from 'src/engine/metadata-modules/role/role.entity';

type ObjectAction =
  | 'read'
  | 'update'
  | 'softDelete'
  | 'destroy';

type FieldAction = 'read' | 'update';

const deny = (reason: string): never => {
  throw new PermissionsException(
    `Role delegation exceeds actor permission ceiling: ${reason}`,
    PermissionsExceptionCode.PERMISSION_DENIED,
    {
      userFriendlyMessage: msg`You cannot assign a role with permissions above your own access level.`,
    },
  );
};

const getEffectiveObjectPermission = ({
  action,
  objectMetadataId,
  role,
}: {
  action: ObjectAction;
  objectMetadataId: string;
  role: RoleEntity;
}): boolean => {
  const objectPermission = (role.objectPermissions ?? []).find(
    (permission) => permission.objectMetadataId === objectMetadataId,
  );

  switch (action) {
    case 'read':
      return (
        objectPermission?.canReadObjectRecords ?? role.canReadAllObjectRecords
      );
    case 'update':
      return (
        objectPermission?.canUpdateObjectRecords ??
        role.canUpdateAllObjectRecords
      );
    case 'softDelete':
      return (
        objectPermission?.canSoftDeleteObjectRecords ??
        role.canSoftDeleteAllObjectRecords
      );
    case 'destroy':
      return (
        objectPermission?.canDestroyObjectRecords ??
        role.canDestroyAllObjectRecords
      );
  }
};

const getEffectiveFieldPermission = ({
  action,
  fieldMetadataId,
  objectMetadataId,
  role,
}: {
  action: FieldAction;
  fieldMetadataId: string;
  objectMetadataId: string;
  role: RoleEntity;
}): boolean => {
  const fieldPermission = (role.fieldPermissions ?? []).find(
    (permission) => permission.fieldMetadataId === fieldMetadataId,
  );

  if (action === 'read') {
    return (
      getEffectiveObjectPermission({
        action: 'read',
        objectMetadataId,
        role,
      }) && fieldPermission?.canReadFieldValue !== false
    );
  }

  return (
    getEffectiveObjectPermission({
      action: 'update',
      objectMetadataId,
      role,
    }) && fieldPermission?.canUpdateFieldValue !== false
  );
};

export const assertRoleWithinDelegationCeilingOrThrow = ({
  actorRole,
  targetRole,
}: {
  actorRole: RoleEntity;
  targetRole: RoleEntity;
}): void => {
  if (actorRole.id === targetRole.id) {
    return;
  }

  const booleanCeilings: Array<{
    actor: boolean;
    label: string;
    target: boolean;
  }> = [
    {
      actor: actorRole.canUpdateAllSettings,
      target: targetRole.canUpdateAllSettings,
      label: 'all settings',
    },
    {
      actor: actorRole.canAccessAllTools,
      target: targetRole.canAccessAllTools,
      label: 'all tools',
    },
    {
      actor: actorRole.canReadAllObjectRecords,
      target: targetRole.canReadAllObjectRecords,
      label: 'read all records',
    },
    {
      actor: actorRole.canUpdateAllObjectRecords,
      target: targetRole.canUpdateAllObjectRecords,
      label: 'update all records',
    },
    {
      actor: actorRole.canSoftDeleteAllObjectRecords,
      target: targetRole.canSoftDeleteAllObjectRecords,
      label: 'soft-delete all records',
    },
    {
      actor: actorRole.canDestroyAllObjectRecords,
      target: targetRole.canDestroyAllObjectRecords,
      label: 'destroy all records',
    },
  ];

  const exceededBooleanCeiling = booleanCeilings.find(
    ({ actor, target }) => target && !actor,
  );

  if (exceededBooleanCeiling) {
    deny(exceededBooleanCeiling.label);
  }

  const actorPermissionFlagIds = new Set(
    (actorRole.rolePermissionFlags ?? []).map(
      (rolePermissionFlag) => rolePermissionFlag.permissionFlagId,
    ),
  );
  const escalatedPermissionFlag = (targetRole.rolePermissionFlags ?? []).find(
    (rolePermissionFlag) =>
      !actorPermissionFlagIds.has(rolePermissionFlag.permissionFlagId),
  );

  if (escalatedPermissionFlag) {
    deny(`permission flag ${escalatedPermissionFlag.permissionFlagId}`);
  }

  const objectMetadataIds = new Set([
    ...(actorRole.objectPermissions ?? []).map(
      (permission) => permission.objectMetadataId,
    ),
    ...(targetRole.objectPermissions ?? []).map(
      (permission) => permission.objectMetadataId,
    ),
  ]);

  for (const objectMetadataId of objectMetadataIds) {
    for (const action of [
      'read',
      'update',
      'softDelete',
      'destroy',
    ] as const) {
      const actorAllowed = getEffectiveObjectPermission({
        action,
        objectMetadataId,
        role: actorRole,
      });
      const targetAllowed = getEffectiveObjectPermission({
        action,
        objectMetadataId,
        role: targetRole,
      });

      if (targetAllowed && !actorAllowed) {
        deny(`${action} access on object ${objectMetadataId}`);
      }
    }
  }

  const fieldMetadataIds = new Set([
    ...(actorRole.fieldPermissions ?? []).map(
      (permission) => permission.fieldMetadataId,
    ),
    ...(targetRole.fieldPermissions ?? []).map(
      (permission) => permission.fieldMetadataId,
    ),
  ]);

  for (const fieldMetadataId of fieldMetadataIds) {
    const actorFieldPermission = (actorRole.fieldPermissions ?? []).find(
      (permission) => permission.fieldMetadataId === fieldMetadataId,
    );
    const targetFieldPermission = (targetRole.fieldPermissions ?? []).find(
      (permission) => permission.fieldMetadataId === fieldMetadataId,
    );
    const objectMetadataId =
      targetFieldPermission?.objectMetadataId ??
      actorFieldPermission?.objectMetadataId;

    if (!objectMetadataId) {
      deny(`unresolvable field permission ${fieldMetadataId}`);
    }

    for (const action of ['read', 'update'] as const) {
      const actorAllowed = getEffectiveFieldPermission({
        action,
        fieldMetadataId,
        objectMetadataId,
        role: actorRole,
      });
      const targetAllowed = getEffectiveFieldPermission({
        action,
        fieldMetadataId,
        objectMetadataId,
        role: targetRole,
      });

      if (targetAllowed && !actorAllowed) {
        deny(`${action} access on field ${fieldMetadataId}`);
      }
    }
  }

  const actorHasRowLevelRules =
    (actorRole.rowLevelPermissionPredicates ?? []).length > 0 ||
    (actorRole.rowLevelPermissionPredicateGroups ?? []).length > 0;
  const targetHasRowLevelRules =
    (targetRole.rowLevelPermissionPredicates ?? []).length > 0 ||
    (targetRole.rowLevelPermissionPredicateGroups ?? []).length > 0;

  if (actorHasRowLevelRules || targetHasRowLevelRules) {
    deny('row-level permission predicates require explicit administrator review');
  }
};
