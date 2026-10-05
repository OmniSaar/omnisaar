import { Injectable } from '@nestjs/common';

import {
  AgentAutonomyPolicyService,
  type AgentAutonomyPolicyResult,
} from 'src/engine/core-modules/approval/agent-autonomy-policy.service';
import {
  ApprovalPolicyService,
  type ApprovalPolicyResult,
} from 'src/engine/core-modules/approval/approval.service';

export type EffectiveApprovalPolicyResult = ApprovalPolicyResult & {
  source: 'hard_guardrail' | 'agent_policy' | 'baseline';
  policyId?: string;
  actionPrefix?: string;
};

@Injectable()
export class EffectiveApprovalPolicyService {
  constructor(
    private readonly agentAutonomyPolicyService: AgentAutonomyPolicyService,
    private readonly baselineApprovalPolicyService: ApprovalPolicyService,
  ) {}

  async evaluate({
    tenantId,
    workspaceId,
    agentId,
    actionType,
  }: {
    tenantId: string;
    workspaceId: string;
    agentId?: string | null;
    actionType: string;
  }): Promise<EffectiveApprovalPolicyResult> {
    const autonomyResult = await this.agentAutonomyPolicyService.evaluate({
      tenantId,
      workspaceId,
      agentId,
      actionType,
    });

    if (autonomyResult) {
      return this.mapAutonomyResult(autonomyResult);
    }

    return {
      ...this.baselineApprovalPolicyService.evaluate(actionType),
      source: 'baseline',
    };
  }

  private mapAutonomyResult(
    result: AgentAutonomyPolicyResult,
  ): EffectiveApprovalPolicyResult {
    return {
      decision: result.decision,
      reason: result.reason,
      version: result.version,
      ...(result.decision === 'approval_required'
        ? { approvalTtlMs: 30 * 60 * 1000 }
        : {}),
      source: result.source,
      ...(result.policyId ? { policyId: result.policyId } : {}),
      ...(result.actionPrefix ? { actionPrefix: result.actionPrefix } : {}),
    };
  }
}
