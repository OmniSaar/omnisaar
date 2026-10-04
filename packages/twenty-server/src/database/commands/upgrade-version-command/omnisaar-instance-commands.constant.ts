import { AddOmniSaarTenantHierarchyFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980000-add-omnisaar-tenant-hierarchy';
import { BackfillOmniSaarTenantHierarchySlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-slow-1791121980001-backfill-omnisaar-tenant-hierarchy';

export const OMNISAAR_INSTANCE_COMMANDS = [
  AddOmniSaarTenantHierarchyFastInstanceCommand,
  BackfillOmniSaarTenantHierarchySlowInstanceCommand,
];
