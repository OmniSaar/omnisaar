import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, type Repository } from 'typeorm';

import { ActivityLedgerService } from 'src/engine/core-modules/activity-ledger/activity-ledger.service';
import {
  ApprovalRequestEntity,
  type ApprovalRequesterType,
} from 'src/engine/core-modules/approval/approval-request.entity';
import { TenantContextService } from 'src/engine/core-modules/tenant/tenant-context.module';
import { WorkspaceAdministrationService } from 'src/engine/core-modules/tenant/workspace-administration.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';

export type ApprovalPolicyDecision =
  | 'allow'
  | 'approval_required'
  | 'deny';

export type ApprovalPolicyResult = {
  decision: ApprovalPolicyDecision;
  reason: string;
  version: string;
  approvalTtlMs?: number;
};

export type ApprovalActionInput = {
  workspaceId: string;
  actionType: string;
  toolName?: string | null;
  actionParameters: Record<string, unknown>;
};

export type ApprovalExecutionDenialReason =
  | 'not-approved'
  | 'expired'
  | 'permission-denied'
  | 'action-mismatch'
  | 'approval-replayed'
  | 'policy-denied';

export type ApprovalExecutionDecision =
  | {
      authorized: true;
      approval: ApprovalRequestEntity;
    }
  | {
      authorized: false;
      reason: ApprovalExecutionDenialReason;
      approval: ApprovalRequestEntity;
    };

const BASELINE_POLICY_VERSION = 'omnisaar-agent-baseline-v0.1';
const DEFAULT_APPROVAL_TTL_MS = 30 * 60 * 1000;
const MAX_STORED_STRUCTURED_BYTES = 32 * 1024;

const DENIED_ACTION_PREFIXES = [
  'administration',
  'security.secret',
  'security.credential',
  'crm.bulk_export',
  'crm.bulk_delete',
];

const APPROVAL_REQUIRED_ACTION_PREFIXES = [
  'conversation.reply.send',
  'commerce.order.update',
  'commerce.order.cancel',
  'commerce.refund',
  'commerce.discount',
  'commerce.credit',
  'identity.merge',
  'email_marketing.send',
  'social.publish',
];

const AUTO_ALLOWED_ACTION_PREFIXES = [
  'identity.resolve',
  'crm.person.get',
  'crm.person.search',
  'commerce.order.get',
  'conversation.get',
  'conversation.reply.draft',
  'crm.task.create',
  'case.escalate',
  'agent.classify',
  'agent.summarize',
];

const SENSITIVE_KEY_PATTERN =
  /(?:password|passwd|secret|authorization|cookie|session|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key)/i;

const matchesPrefix = (actionType: string, prefixes: string[]) =>
  prefixes.some(
    (prefix) => actionType === prefix || actionType.startsWith(`${prefix}.`),
  );

const normalizeJsonValue = (value: unknown): unknown => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(
        'Approval action parameters must contain only finite JSON numbers.',
      );
    }

    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }

  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((normalized, key) => {
        const nestedValue = (value as Record<string, unknown>)[key];

        if (nestedValue !== undefined) {
          normalized[key] = normalizeJsonValue(nestedValue);
        }

        return normalized;
      }, {});
  }

  throw new BadRequestException(
    'Approval action parameters must be JSON-serializable.',
  );
};

const assertSafeStoredData = (
  value: unknown,
  path = 'value',
): void => {
  let serialized: string | undefined;

  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new BadRequestException(
      `${path} must contain only JSON-serializable values.`,
    );
  }

  if (serialized === undefined) {
    throw new BadRequestException(
      `${path} must contain only JSON-serializable values.`,
    );
  }

  if (serialized.length > MAX_STORED_STRUCTURED_BYTES) {
    throw new BadRequestException(
      `${path} is too large for approval storage. Store a canonical record or artifact reference instead.`,
    );
  }

  const visit = (nested: unknown, nestedPath: string): void => {
    if (Array.isArray(nested)) {
      nested.forEach((item, index) => visit(item, `${nestedPath}[${index}]`));

      return;
    }

    if (nested === null || typeof nested !== 'object') {
      return;
    }

    for (const [key, child] of Object.entries(nested)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        throw new BadRequestException(
          `Sensitive key ${nestedPath}.${key} is not allowed in approval storage.`,
        );
      }

      visit(child, `${nestedPath}.${key}`);
    }
  };

  visit(value, path);
};

export const computeApprovalActionHash = ({
  workspaceId,
  actionType,
  toolName,
  actionParameters,
}: ApprovalActionInput): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        workspaceId,
        actionType,
        toolName: toolName ?? null,
        actionParameters: normalizeJsonValue(actionParameters),
      }),
    )
    .digest('hex');

@Injectable()
export class ApprovalPolicyService {
  evaluate(actionType: string): ApprovalPolicyResult {
    if (matchesPrefix(actionType, DENIED_ACTION_PREFIXES)) {
      return {
        decision: 'deny',
        reason: 'This action class is denied by the OmniSaar baseline policy.',
        version: BASELINE_POLICY_VERSION,
      };
    }

    if (matchesPrefix(actionType, AUTO_ALLOWED_ACTION_PREFIXES)) {
      return {
        decision: 'allow',
        reason: 'This action class is safe for automatic execution after permission checks.',
        version: BASELINE_POLICY_VERSION,
      };
    }

    if (matchesPrefix(actionType, APPROVAL_REQUIRED_ACTION_PREFIXES)) {
      return {
        decision: 'approval_required',
        reason: 'This consequential action requires human approval.',
        version: BASELINE_POLICY_VERSION,
        approvalTtlMs: DEFAULT_APPROVAL_TTL_MS,
      };
    }

    return {
      decision: 'approval_required',
      reason: 'Unknown or unclassified actions require approval by default.',
      version: BASELINE_POLICY_VERSION,
      approvalTtlMs: DEFAULT_APPROVAL_TTL_MS,
    };
  }
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvalRepository: Repository<ApprovalRequestEntity>,
    @InjectRepository(UserWorkspaceEntity)
    private readonly userWorkspaceRepository: Repository<UserWorkspaceEntity>,
    private readonly activityLedgerService: ActivityLedgerService,
    private readonly tenantContextService: TenantContextService,
    private readonly workspaceAdministrationService: WorkspaceAdministrationService,
    private readonly userRoleService: UserRoleService,
    private readonly approvalPolicyService: ApprovalPolicyService,
  ) {}

  async evaluateAndRequest({
    tenantId,
    workspaceId,
    requestedByPrincipalType,
    requestedByPrincipalId,
    requesterId,
    membershipId,
    agentTurnId,
    agentId,
    actionType,
    toolName,
    actionParameters,
    actionPreview,
    requiredApproverRoleId,
    permissionGranted,
    permissionReason,
    correlationId = randomUUID(),
    idempotencyKey,
  }: {
    tenantId: string;
    workspaceId: string;
    requestedByPrincipalType: ApprovalRequesterType;
    requestedByPrincipalId: string;
    requesterId?: string | null;
    membershipId?: string | null;
    agentTurnId?: string | null;
    agentId?: string | null;
    actionType: string;
    toolName?: string | null;
    actionParameters: Record<string, unknown>;
    actionPreview: Record<string, unknown>;
    requiredApproverRoleId?: string | null;
    permissionGranted: boolean;
    permissionReason?: string;
    correlationId?: string;
    idempotencyKey?: string;
  }): Promise<
    | { decision: 'allow'; policy: ApprovalPolicyResult }
    | { decision: 'deny'; policy: ApprovalPolicyResult }
    | {
        decision: 'approval_required';
        policy: ApprovalPolicyResult;
        approval: ApprovalRequestEntity;
      }
  > {
    await this.tenantContextService.assertWorkspaceBelongsToTenant({
      tenantId,
      workspaceId,
    });

    if (!permissionGranted) {
      const policy: ApprovalPolicyResult = {
        decision: 'deny',
        reason: permissionReason ?? 'The principal lacks permission for this action.',
        version: BASELINE_POLICY_VERSION,
      };

      await this.recordActionDenied({
        tenantId,
        workspaceId,
        requestedByPrincipalType,
        requestedByPrincipalId,
        requesterId,
        membershipId,
        correlationId,
        actionType,
        toolName,
        actionHash: computeApprovalActionHash({
          workspaceId,
          actionType,
          toolName,
          actionParameters,
        }),
        reason: policy.reason,
      });

      return { decision: 'deny', policy };
    }

    const policy = this.approvalPolicyService.evaluate(actionType);

    if (policy.decision === 'deny') {
      await this.recordActionDenied({
        tenantId,
        workspaceId,
        requestedByPrincipalType,
        requestedByPrincipalId,
        requesterId,
        membershipId,
        correlationId,
        actionType,
        toolName,
        actionHash: computeApprovalActionHash({
          workspaceId,
          actionType,
          toolName,
          actionParameters,
        }),
        reason: policy.reason,
      });

      return { decision: 'deny', policy };
    }

    if (policy.decision === 'allow') {
      return { decision: 'allow', policy };
    }

    const approval = await this.requestApproval({
      tenantId,
      workspaceId,
      requestedByPrincipalType,
      requestedByPrincipalId,
      requesterId,
      membershipId,
      agentTurnId,
      agentId,
      actionType,
      toolName,
      actionParameters,
      actionPreview,
      requiredApproverRoleId,
      policySnapshot: policy,
      expiresAt: new Date(
        Date.now() + (policy.approvalTtlMs ?? DEFAULT_APPROVAL_TTL_MS),
      ),
      correlationId,
      idempotencyKey,
    });

    return { decision: 'approval_required', policy, approval };
  }

  async requestApproval({
    tenantId,
    workspaceId,
    requestedByPrincipalType,
    requestedByPrincipalId,
    requesterId,
    membershipId,
    agentTurnId,
    agentId,
    actionType,
    toolName,
    actionParameters,
    actionPreview,
    policySnapshot,
    requiredApproverRoleId,
    expiresAt,
    correlationId = randomUUID(),
    idempotencyKey,
  }: {
    tenantId: string;
    workspaceId: string;
    requestedByPrincipalType: ApprovalRequesterType;
    requestedByPrincipalId: string;
    requesterId?: string | null;
    membershipId?: string | null;
    agentTurnId?: string | null;
    agentId?: string | null;
    actionType: string;
    toolName?: string | null;
    actionParameters: Record<string, unknown>;
    actionPreview: Record<string, unknown>;
    policySnapshot: Record<string, unknown>;
    requiredApproverRoleId?: string | null;
    expiresAt: Date;
    correlationId?: string;
    idempotencyKey?: string;
  }): Promise<ApprovalRequestEntity> {
    await this.tenantContextService.assertWorkspaceBelongsToTenant({
      tenantId,
      workspaceId,
    });

    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Approval expiry must be in the future.');
    }

    assertSafeStoredData(actionPreview, 'actionPreview');
    assertSafeStoredData(policySnapshot, 'policySnapshot');

    const actionHash = computeApprovalActionHash({
      workspaceId,
      actionType,
      toolName,
      actionParameters,
    });

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ApprovalRequestEntity);

      if (idempotencyKey) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`approval:${tenantId}:${workspaceId}:${idempotencyKey}`],
        );

        const existing = await repository.findOne({
          where: { tenantId, workspaceId, idempotencyKey },
        });

        if (existing) {
          if (existing.actionHash !== actionHash) {
            throw new ConflictException(
              'Idempotency key is already bound to a different approval action.',
            );
          }

          return existing;
        }
      }

      const approval = await repository.save(
        repository.create({
          tenantId,
          workspaceId,
          agentTurnId: agentTurnId ?? null,
          agentId: agentId ?? null,
          requestedByPrincipalType,
          requestedByPrincipalId,
          requesterId: requesterId ?? null,
          membershipId: membershipId ?? null,
          actionType,
          toolName: toolName ?? null,
          actionHash,
          actionPreview,
          policySnapshot,
          requiredApproverRoleId: requiredApproverRoleId ?? null,
          status: 'pending',
          decidedByPrincipalId: null,
          decisionReason: null,
          expiresAt,
          decidedAt: null,
          consumedAt: null,
          executionId: null,
          correlationId,
          idempotencyKey: idempotencyKey ?? null,
        }),
      );

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: 'approval.requested',
        tenantId,
        workspaceId,
        actorType: requestedByPrincipalType,
        actorId: requestedByPrincipalId,
        requesterId: requesterId ?? null,
        membershipId: membershipId ?? null,
        correlationId,
        subjectType: 'approvalRequest',
        subjectId: approval.id,
        action: actionType,
        result: 'pending',
        approvalState: 'pending',
        idempotencyKey: `approval-request:${approval.id}`,
        metadata: {
          actionType,
          toolName: toolName ?? null,
          actionHash,
          requiredApproverRoleId: requiredApproverRoleId ?? null,
          expiresAt: expiresAt.toISOString(),
          policyVersion:
            typeof policySnapshot.version === 'string'
              ? policySnapshot.version
              : null,
        },
      });

      return approval;
    });
  }

  async decideApproval({
    approvalId,
    approverUserId,
    decision,
    reason,
  }: {
    approvalId: string;
    approverUserId: string;
    decision: 'approve' | 'deny';
    reason?: string;
  }): Promise<ApprovalRequestEntity> {
    const approval = await this.approvalRepository.findOne({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found.');
    }

    try {
      await this.assertApproverAuthority({ approval, approverUserId });
    } catch (error) {
      await this.activityLedgerService
        .append({
          eventType: 'security.approval_decision_denied',
          tenantId: approval.tenantId,
          workspaceId: approval.workspaceId,
          actorType: 'human',
          actorId: approverUserId,
          requesterId: approverUserId,
          correlationId: approval.correlationId,
          subjectType: 'approvalRequest',
          subjectId: approval.id,
          action: 'approval.decide',
          result: 'denied',
          approvalState: approval.status,
          metadata: { reason: 'approver-authority-denied' },
        })
        .catch(() => undefined);

      throw error;
    }

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ApprovalRequestEntity);
      const locked = await repository.findOne({
        where: { id: approvalId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!locked) {
        throw new NotFoundException('Approval request not found.');
      }

      if (locked.status === 'approved' || locked.status === 'denied') {
        if (
          locked.decidedByPrincipalId === approverUserId &&
          ((decision === 'approve' && locked.status === 'approved') ||
            (decision === 'deny' && locked.status === 'denied'))
        ) {
          return locked;
        }

        throw new ConflictException('Approval request has already been decided.');
      }

      if (locked.status !== 'pending') {
        throw new ConflictException(
          `Approval request is ${locked.status} and cannot be decided.`,
        );
      }

      if (locked.expiresAt.getTime() <= Date.now()) {
        locked.status = 'expired';
        await repository.save(locked);
        await this.appendApprovalStateEvent(manager, locked, {
          eventType: 'approval.expired',
          actorId: approverUserId,
          result: 'cancelled',
        });

        return locked;
      }

      locked.status = decision === 'approve' ? 'approved' : 'denied';
      locked.decidedByPrincipalId = approverUserId;
      locked.decisionReason = reason?.trim() || null;
      locked.decidedAt = new Date();

      const saved = await repository.save(locked);

      await this.appendApprovalStateEvent(manager, saved, {
        eventType:
          decision === 'approve' ? 'approval.granted' : 'approval.denied',
        actorId: approverUserId,
        result: decision === 'approve' ? 'success' : 'denied',
      });

      return saved;
    });
  }

  async authorizeExecution({
    approvalId,
    executionId,
    actorType,
    actorId,
    requesterId,
    membershipId,
    actionType,
    toolName,
    actionParameters,
    permissionGranted,
    permissionReason,
  }: {
    approvalId: string;
    executionId: string;
    actorType: ApprovalRequesterType;
    actorId: string;
    requesterId?: string | null;
    membershipId?: string | null;
    actionType: string;
    toolName?: string | null;
    actionParameters: Record<string, unknown>;
    permissionGranted: boolean;
    permissionReason?: string;
  }): Promise<ApprovalExecutionDecision> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ApprovalRequestEntity);
      const approval = await repository.findOne({
        where: { id: approvalId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!approval) {
        throw new NotFoundException('Approval request not found.');
      }

      const deny = async (
        reason: ApprovalExecutionDenialReason,
      ): Promise<ApprovalExecutionDecision> => {
        await this.activityLedgerService.appendWithManager(manager, {
          eventType: 'agent.action_denied',
          tenantId: approval.tenantId,
          workspaceId: approval.workspaceId,
          actorType,
          actorId,
          requesterId: requesterId ?? null,
          membershipId: membershipId ?? null,
          correlationId: approval.correlationId,
          subjectType: 'approvalRequest',
          subjectId: approval.id,
          action: actionType,
          result: 'denied',
          approvalState: approval.status,
          idempotencyKey: `approval-execution-denied:${approval.id}:${executionId}:${reason}`,
          metadata: {
            reason,
            executionId,
            permissionReason:
              reason === 'permission-denied' ? permissionReason ?? null : null,
          },
        });

        return { authorized: false, reason, approval };
      };

      if (approval.status !== 'approved') {
        return deny('not-approved');
      }

      if (!permissionGranted) {
        return deny('permission-denied');
      }

      const currentPolicy = this.approvalPolicyService.evaluate(actionType);

      if (currentPolicy.decision === 'deny') {
        return deny('policy-denied');
      }

      const actionHash = computeApprovalActionHash({
        workspaceId: approval.workspaceId,
        actionType,
        toolName,
        actionParameters,
      });

      if (actionHash !== approval.actionHash) {
        return deny('action-mismatch');
      }

      if (approval.consumedAt) {
        if (approval.executionId === executionId) {
          return { authorized: true, approval };
        }

        return deny('approval-replayed');
      }

      if (approval.expiresAt.getTime() <= Date.now()) {
        approval.status = 'expired';
        await repository.save(approval);
        await this.appendApprovalStateEvent(manager, approval, {
          eventType: 'approval.expired',
          actorId,
          result: 'cancelled',
        });

        return deny('expired');
      }

      approval.consumedAt = new Date();
      approval.executionId = executionId;
      const saved = await repository.save(approval);

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: 'approval.execution_authorized',
        tenantId: saved.tenantId,
        workspaceId: saved.workspaceId,
        actorType,
        actorId,
        requesterId: requesterId ?? null,
        membershipId: membershipId ?? null,
        correlationId: saved.correlationId,
        subjectType: 'approvalRequest',
        subjectId: saved.id,
        action: actionType,
        result: 'success',
        approvalState: 'approved',
        idempotencyKey: `approval-execution:${saved.id}:${executionId}`,
        metadata: {
          executionId,
          actionHash,
          toolName: toolName ?? null,
        },
      });

      return { authorized: true, approval: saved };
    });
  }

  private async assertApproverAuthority({
    approval,
    approverUserId,
  }: {
    approval: ApprovalRequestEntity;
    approverUserId: string;
  }): Promise<void> {
    if (approval.requiredApproverRoleId) {
      const userWorkspace = await this.userWorkspaceRepository.findOne({
        where: {
          userId: approverUserId,
          workspaceId: approval.workspaceId,
        },
      });

      if (userWorkspace) {
        const roleId = await this.userRoleService
          .getRoleIdForUserWorkspace({
            workspaceId: approval.workspaceId,
            userWorkspaceId: userWorkspace.id,
          })
          .catch(() => undefined);

        if (roleId === approval.requiredApproverRoleId) {
          return;
        }
      }
    }

    await this.workspaceAdministrationService.assertCapability({
      capability: 'workspace.approvals.manage',
      tenantId: approval.tenantId,
      workspaceId: approval.workspaceId,
      userId: approverUserId,
    });
  }

  private async appendApprovalStateEvent(
    manager: EntityManager,
    approval: ApprovalRequestEntity,
    {
      eventType,
      actorId,
      result,
    }: {
      eventType: string;
      actorId: string;
      result: 'success' | 'denied' | 'cancelled';
    },
  ): Promise<void> {
    await this.activityLedgerService.appendWithManager(manager, {
      eventType,
      tenantId: approval.tenantId,
      workspaceId: approval.workspaceId,
      actorType: 'human',
      actorId,
      requesterId: actorId,
      correlationId: approval.correlationId,
      subjectType: 'approvalRequest',
      subjectId: approval.id,
      action: 'approval.decide',
      result,
      approvalState: approval.status,
      idempotencyKey: `${eventType}:${approval.id}`,
      metadata: {
        actionType: approval.actionType,
        actionHash: approval.actionHash,
        decisionReason: approval.decisionReason,
      },
    });
  }

  private async recordActionDenied({
    tenantId,
    workspaceId,
    requestedByPrincipalType,
    requestedByPrincipalId,
    requesterId,
    membershipId,
    correlationId,
    actionType,
    toolName,
    actionHash,
    reason,
  }: {
    tenantId: string;
    workspaceId: string;
    requestedByPrincipalType: ApprovalRequesterType;
    requestedByPrincipalId: string;
    requesterId?: string | null;
    membershipId?: string | null;
    correlationId: string;
    actionType: string;
    toolName?: string | null;
    actionHash: string;
    reason: string;
  }): Promise<void> {
    await this.activityLedgerService.append({
      eventType: 'agent.action_denied',
      tenantId,
      workspaceId,
      actorType: requestedByPrincipalType,
      actorId: requestedByPrincipalId,
      requesterId: requesterId ?? null,
      membershipId: membershipId ?? null,
      correlationId,
      subjectType: 'action',
      subjectId: actionHash,
      action: actionType,
      result: 'denied',
      metadata: {
        reason,
        actionHash,
        toolName: toolName ?? null,
      },
    });
  }
}
