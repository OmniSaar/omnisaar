import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActivityLedgerModule } from 'src/engine/core-modules/activity-ledger/activity-ledger.module';
import { ApprovalRequestEntity } from 'src/engine/core-modules/approval/approval-request.entity';
import {
  ApprovalPolicyService,
  ApprovalService,
} from 'src/engine/core-modules/approval/approval.service';
import { TenantModule } from 'src/engine/core-modules/tenant/tenant-context.module';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';

@Module({
  imports: [
    ActivityLedgerModule,
    TenantModule,
    UserRoleModule,
    TypeOrmModule.forFeature([ApprovalRequestEntity, UserWorkspaceEntity]),
  ],
  providers: [ApprovalPolicyService, ApprovalService],
  exports: [ApprovalPolicyService, ApprovalService],
})
export class ApprovalModule {}
