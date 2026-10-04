import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActivityLedgerEventEntity } from 'src/engine/core-modules/activity-ledger/activity-ledger-event.entity';
import { ActivityLedgerService } from 'src/engine/core-modules/activity-ledger/activity-ledger.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLedgerEventEntity])],
  providers: [ActivityLedgerService],
  exports: [ActivityLedgerService],
})
export class ActivityLedgerModule {}
