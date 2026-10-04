import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  EntityManager,
  IsNull,
  QueryFailedError,
  Repository,
} from 'typeorm';

import {
  ActivityLedgerEventEntity,
  type ActivityLedgerActorType,
  type ActivityLedgerResult,
} from 'src/engine/core-modules/activity-ledger/activity-ledger-event.entity';

export type AppendActivityLedgerEventInput = {
  eventType: string;
  occurredAt?: Date;
  instanceId?: string | null;
  tenantId?: string | null;
  workspaceId?: string | null;
  actorType: ActivityLedgerActorType;
  actorId?: string | null;
  requesterId?: string | null;
  membershipId?: string | null;
  correlationId: string;
  causationId?: string | null;
  subjectType: string;
  subjectId?: string | null;
  action: string;
  result: ActivityLedgerResult;
  approvalState?: string | null;
  provider?: string | null;
  integrationConnectionId?: string | null;
  durationMs?: number | null;
  cost?: string | null;
  tokenUsage?: number | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  artifactReferences?: Array<Record<string, unknown>>;
};

type ActivityLedgerRepository = Repository<ActivityLedgerEventEntity>;

const SENSITIVE_METADATA_KEY_PATTERN =
  /(?:password|passwd|secret|authorization|cookie|session|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key)/i;

const assertMetadataIsSafe = (
  value: unknown,
  path = 'metadata',
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertMetadataIsSafe(item, `${path}[${index}]`),
    );

    return;
  }

  if (value === null || typeof value !== 'object') {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        `Sensitive key ${path}.${key} is not allowed in Activity Ledger metadata. Store a reference or redacted summary instead.`,
      );
    }

    assertMetadataIsSafe(nestedValue, `${path}.${key}`);
  }
};

@Injectable()
export class ActivityLedgerService {
  constructor(
    @InjectRepository(ActivityLedgerEventEntity)
    private readonly activityLedgerRepository: ActivityLedgerRepository,
  ) {}

  async append(
    input: AppendActivityLedgerEventInput,
  ): Promise<ActivityLedgerEventEntity> {
    return this.appendUsingRepository(this.activityLedgerRepository, input);
  }

  async appendWithManager(
    manager: EntityManager,
    input: AppendActivityLedgerEventInput,
  ): Promise<ActivityLedgerEventEntity> {
    return this.appendUsingRepository(
      manager.getRepository(ActivityLedgerEventEntity),
      input,
    );
  }

  private async appendUsingRepository(
    repository: ActivityLedgerRepository,
    input: AppendActivityLedgerEventInput,
  ): Promise<ActivityLedgerEventEntity> {
    assertMetadataIsSafe(input.metadata ?? {});
    assertMetadataIsSafe(input.artifactReferences ?? [], 'artifactReferences');

    const event = repository.create({
      ...input,
      occurredAt: input.occurredAt ?? new Date(),
      instanceId: input.instanceId ?? null,
      tenantId: input.tenantId ?? null,
      workspaceId: input.workspaceId ?? null,
      actorId: input.actorId ?? null,
      requesterId: input.requesterId ?? null,
      membershipId: input.membershipId ?? null,
      causationId: input.causationId ?? null,
      subjectId: input.subjectId ?? null,
      approvalState: input.approvalState ?? null,
      provider: input.provider ?? null,
      integrationConnectionId: input.integrationConnectionId ?? null,
      durationMs: input.durationMs ?? null,
      cost: input.cost ?? null,
      tokenUsage: input.tokenUsage ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      metadata: input.metadata ?? {},
      artifactReferences: input.artifactReferences ?? [],
    });

    try {
      return await repository.save(event);
    } catch (error) {
      if (
        input.idempotencyKey &&
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string } | undefined)?.code === '23505'
      ) {
        const existingEvent = await repository.findOne({
          where: {
            tenantId: input.tenantId ?? IsNull(),
            workspaceId: input.workspaceId ?? IsNull(),
            idempotencyKey: input.idempotencyKey,
          },
        });

        if (existingEvent) {
          return existingEvent;
        }
      }

      throw error;
    }
  }
}
