# First Vertical Slice

## Flow
`Shopify → Customer/Order → WhatsApp → Inbox → Hermes → Human Approval → Reply → Activity Ledger`

## Acceptance criteria
- Shopify customer and order data synchronize without duplicating canonical identities.
- WhatsApp inbound messages are ingested, deduplicated and threaded correctly.
- Phone/provider identity resolves to the correct OmniSaar Person when known.
- Unknown identities can be safely created or queued for resolution according to policy.
- Hermes receives only the customer/order/conversation context and tools permitted by its role.
- Low-risk draft generation is automatic.
- Consequential actions respect approval policy.
- Approved replies route through the OmniSaar outbound messaging gateway to WhatsApp.
- Human, agent, workflow and provider actions are written to the Activity Ledger.
- Failures are observable and replay-safe.
- Secrets and provider credentials never enter customer-facing records or source control.

## Why this slice comes first
It proves the most important architecture assumptions at once: commerce context, omnichannel identity, messaging, agents, approvals, outbound actions and the activity ledger.
