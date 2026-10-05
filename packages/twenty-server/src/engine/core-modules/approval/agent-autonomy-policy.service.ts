import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { ActivityLedgerService } from 'src/engine/core-modules/activity-ledger/activity-ledger.service';
import {
  AGENT_AUTONOMY_DECISIONS,
  AgentAutonomyPolicyEntity,
  type AgentAutonomyDecision,
} from 'src/engine/core-modules/approval/agent-autonomy-policy.entity';
import { WorkspaceAdministrationService } from 'src/engine/core-modules/tenant/workspace-administration.service';

export const AGENT_AUTONOMY_POLICY_VERSION =
  'omnisaar-agent-autonomy-v0.1';

export type AgentAutonomyPolicyResult = {
  decision: AgentAutonomyDecision;
  source: 'hard_guardrail' | 'agent_policy';
  reason: string;
  version: string;
  policyId?: string;
  actionPrefix?: string;
};

const NON_BYPASSABLE_ACTION_PREFIXES = [
  'administration',
  'security.secret',
  'security.credential',
  'crm.bulk_export',
  'crm.bulk_delete',
] as const;

const actionMatchesPrefix = (actionType: string, actionPrefix: string) =>
  actionPrefix === '*' ||
  actionType === actionPrefix ||
  actionType.startsWith(`${actionPrefix}.`);

const ruleOverlapsProtectedAction = (actionPrefix: string) =>
  actionPrefix !== '*' &&
  NON_BYPASSABLE_ACTION_PREFIXES.some(
    (protectedPrefix) =>
      actionMatchesPrefix(protectedPrefix, actionPrefix) ||
      actionMatchesPrefix(actionPrefix, protectedPrefix),
  );

@Injectable()
export class AgentAutonomyPolicyService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AgentAutonomyPolicyEntity)
    private readonly policyRepository: Repository<AgentAutonomyPolicyEntity>,
    private readonly workspaceAdministrationService: WorkspaceAdministrationService,
    private readonly activityLedgerService: ActivityLedgerService,
  ) {}

  async evaluate({
    tenantId,
    workspaceId,
    agentId,
    actionType,
  }: {
    tenantId: string;
    workspaceId: string;
    agentId: string | null | undefined;
    actionType: string;
  }): Promise<AgentAutonomyPolicyResult | null> {
    if (
      NON_BYPASSABLE_ACTION_PREFIXES.some((prefix) =>
        actionMatchesPrefix(actionType, prefix),
      )
    ) {
      return {
        decision: 'deny',
        source: 'hard_guardrail',
        reason:
          'This action class is protected by a non-bypassable OmniSaar guardrail.',
        version: AGENT_AUTONOMY_POLICY_VERSION,
      };
    }

    if (!agentId) {
      return null;
    }

    const policies = await this.policyRepository.find({
      where: {
        tenantId,
        workspaceId,
        agentId,
        enabled: true,
      },
    });

    const killSwitch = policies.find(
      ({ actionPrefix, decision }) =>
        actionPrefix === '*' && decision === 'deny',
    );

    if (killSwitch) {
      return {
        decision: 'deny',
        source: 'agent_policy',
        reason:
          killSwitch.reason ??
          'This agent is paused by an explicit deny-all autonomy policy.',
        version: AGENT_AUTONOMY_POLICY_VERSION,
        policyId: killSwitch.id,
        actionPrefix: killSwitch.actionPrefix,
      };
    }

    const matchingPolicy = policies
      .filter(({ actionPrefix }) =>
        actionMatchesPrefix(actionType, actionPrefix),
      )
      .sort((left, right) => {
        if (left.actionPrefix === '*') {
          return 1;
        }

        if (right.actionPrefix === '*') {
          return -1;
        }

        return right.actionPrefix.length - left.actionPrefix.length;
      })[0];

    if (!matchingPolicy) {
      return null;
    }

    return {
      decision: matchingPolicy.decision,
      source: 'agent_policy',
      reason:
        matchingPolicy.reason ??
        `Agent autonomy policy resolved ${matchingPolicy.decision} for ${actionType}.`,
      version: AGENT_AUTONOMY_POLICY_VERSION,
      policyId: matchingPolicy.id,
      actionPrefix: matchingPolicy.actionPrefix,
    };
  }

  async setPolicy({
    tenantId,
    workspaceId,
    agentId,
    actionPrefix,
    decision,
    reason,
    actorUserId,
    correlationId = randomUUID(),
  }: {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    actionPrefix: string;
    decision: AgentAutonomyDecision;
    reason?: string | null;
    actorUserId: string;
    correlationId?: string;
  }): Promise<AgentAutonomyPolicyEntity> {
    const normalizedActionPrefix = actionPrefix.trim();

    if (normalizedActionPrefix.length === 0) {
      throw new BadRequestException('Agent autonomy action prefix is required.');
    }

    if (!AGENT_AUTONOMY_DECISIONS.includes(decision)) {
      throw new BadRequestException(
        `Unknown agent autonomy decision: ${decision}`,
      );
    }

    if (
      decision !== 'deny' &&
      ruleOverlapsProtectedAction(normalizedActionPrefix)
    ) {
      throw new BadRequestException(
        'Non-bypassable safety actions cannot be made autonomous or approval-only.',
      );
    }

    await this.workspaceAdministrationService.assertCapability({
      capability: 'workspace.agents.manage',
      tenantId,
      userId: actorUserId,
      workspaceId,
    });
    await this.workspaceAdministrationService.assertCapability({
      capability: 'workspace.approvals.manage',
      tenantId,
      userId: actorUserId,
      workspaceId,
    });

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AgentAutonomyPolicyEntity);
      const existing = await repository.findOne({
        where: {
          tenantId,
          workspaceId,
          agentId,
          actionPrefix: normalizedActionPrefix,
        },
      });

      const policy = await repository.save(
        existing
          ? repository.merge(existing, {
              decision,
              enabled: true,
              reason: reason ?? null,
            })
          : repository.create({
              tenantId,
              workspaceId,
              agentId,
              actionPrefix: normalizedActionPrefix,
              decision,
              enabled: true,
              reason: reason ?? null,
              createdByPrincipalId: actorUserId,
            }),
      );

      await this.activityLedgerService.appendWithManager(manager, {
        eventType: 'agent.autonomy_policy.changed',
        tenantId,
        workspaceId,
        actorType: 'human',
        actorId: actorUserId,
        requesterId: actorUserId,
        correlationId,
        subjectType: 'agent',
        subjectId: agentId,
        action: 'agent.autonomy_policy.set',
        result: 'success',
        metadata: {
          policyId: policy.id,
          actionPrefix: policy.actionPrefix,
          decision: policy.decision,
          enabled: policy.enabled,
          policyVersion: AGENT_AUTONOMY_POLICY_VERSION,
        },
      });

      return policy;
    });
  }
}
