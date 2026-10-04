import { AddOmniSaarTenantHierarchyFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980000-add-omnisaar-tenant-hierarchy';
import { AddOmniSaarTenantMembershipFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980100-add-omnisaar-tenant-membership';
import { BackfillOmniSaarTenantHierarchySlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-slow-1791121980001-backfill-omnisaar-tenant-hierarchy';
import { BackfillOmniSaarTenantMembershipSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-slow-1791121980101-backfill-omnisaar-tenant-membership';

export const OMNISAAR_INSTANCE_COMMANDS = [
  AddOmniSaarTenantHierarchyFastInstanceCommand,
  BackfillOmniSaarTenantHierarchySlowInstanceCommand,
  AddOmniSaarTenantMembershipFastInstanceCommand,
  BackfillOmniSaarTenantMembershipSlowInstanceCommand,
];
