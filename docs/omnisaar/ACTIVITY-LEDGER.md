# OmniSaar Activity Ledger Runtime Contract

The Activity Ledger is OmniSaar's append-oriented operational audit stream for humans, agents, automations, providers and system actions.

## Guarantees in v0.1

- PostgreSQL-backed open-source storage.
- Tenant/workspace scope is explicit on every event where applicable.
- Human, agent, automation, provider and system actor types are normalized.
- Correlation and causation fields support end-to-end reconstruction.
- Scoped idempotency prevents duplicate provider/job deliveries from creating duplicate audit events.
- Transaction-scoped advisory locking makes idempotent appends safe under concurrent retries.
- Metadata and artifact references are structurally constrained and reject common secret-bearing keys.
- Duration, cost and token usage cannot be negative.
- Operational entities are referenced by identifiers rather than cascading foreign keys, so deleting a domain record does not silently erase audit history.
- Tenant ownership, tenant membership and workspace-administration changes are recorded atomically with the mutation that produced them.

## Content rule

Do not store message bodies, credentials, provider payloads or unrestricted customer data in the ledger. Store canonical record IDs, redacted summaries and artifact references instead.

## Initial security events

- `security.tenant_owner_bootstrapped`
- `security.tenant_membership_granted`
- `security.tenant_membership_updated`
- `security.workspace_admin_granted`
- `security.workspace_admin_updated`

Subsequent slices extend this to role mutations, denied actions, approvals, agents, integrations, conversations, commerce and automation.
