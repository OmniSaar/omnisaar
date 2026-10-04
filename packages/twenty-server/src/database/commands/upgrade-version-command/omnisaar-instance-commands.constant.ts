import { AddOmniSaarTenantHierarchyFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980000-add-omnisaar-tenant-hierarchy';
import { AddOmniSaarTenantMembershipFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980100-add-omnisaar-tenant-membership';
import { AddWorkspaceAdministrationGrantsFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980200-add-workspace-administration-grants';
import { HardenOmniSaarTenantProvisioningFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980300-harden-omnisaar-tenant-provisioning';
import { AddOmniSaarActivityLedgerFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980400-add-omnisaar-activity-ledger';
import { AddOmniSaarApprovalEngineFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-fast-1791121980500-add-omnisaar-approval-engine';
import { BackfillOmniSaarTenantHierarchySlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-slow-1791121980001-backfill-omnisaar-tenant-hierarchy';
import { BackfillOmniSaarTenantMembershipSlowInstanceCommand } from 'src/database/commands/upgrade-version-command/2-46/2-46-instance-command-slow-1791121980101-backfill-omnisaar-tenant-membership';

export const OMNISAAR_INSTANCE_COMMANDS = [
  AddOmniSaarTenantHierarchyFastInstanceCommand,
  BackfillOmniSaarTenantHierarchySlowInstanceCommand,
  AddOmniSaarTenantMembershipFastInstanceCommand,
  BackfillOmniSaarTenantMembershipSlowInstanceCommand,
  AddWorkspaceAdministrationGrantsFastInstanceCommand,
  HardenOmniSaarTenantProvisioningFastInstanceCommand,
  AddOmniSaarActivityLedgerFastInstanceCommand,
  AddOmniSaarApprovalEngineFastInstanceCommand,
];
