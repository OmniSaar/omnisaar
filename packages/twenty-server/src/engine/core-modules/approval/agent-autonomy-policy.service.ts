import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import {
  AgentAutonomyPolicyEntity,
  type AgentAutonomyDecision,
} from 'src/engine/core-modules/approval/agent-autonomy-policy.entity';

export type AgentAutonomyPolicyResult = {
  decision: AgentAutonomyDecision;
  source: 'hard_guardrail' | 'agent_policy';
  reason: string;
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

@Injectable()
export class AgentAutonomyPolicyService {
  constructor(
    @InjectRepository(AgentAutonomyPolicyEntity)
    private readonly policyRepository: Repository<AgentAutonomyPolicyEntity>,
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
      policyId: matchingPolicy.id,
      actionPrefix: matchingPolicy.actionPrefix,
    };
  }
}
