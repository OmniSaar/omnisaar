# OmniSaar fork context

OmniSaar is an open-source, white-label, agent-native Customer Operations platform built as a long-lived fork of Twenty.

## Canonical product domains
- CRM
- Inbox
- Commerce
- Email Marketing
- Social
- Agents
- Automation
- Reports
- Integrations
- White Label / Workspace Administration
- Event & Activity Ledger

## Canonical cross-repository sources
- Product strategy, PRDs and architecture decisions: `OmniSaar/core`
- Current state, routing and blockers: `OmniSaar/Progress-Memory`
- Reusable operating procedures: `OmniSaar/Process-and-Workflows`
- Reusable packaged agent capabilities: `OmniSaar/Skills`
- Operational orchestration/evaluations: `OmniSaar/Automation`
- Brand and white-label design contract: `OmniSaar/design-system`

## Engineering rule
Preserve upstream Twenty compatibility where practical, but do not let compatibility block durable OmniSaar product value. Deep core changes are allowed when they are intentional, tested, documented and upgrade-aware.

## Current architecture-proving milestone
`Shopify → Customer/Order → WhatsApp → Inbox → Hermes → Human Approval → Reply → Activity Ledger`

See `PRODUCT-LAYERS.md`, `FIRST-VERTICAL-SLICE.md` and `UPSTREAM.md` in this directory.
