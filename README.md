# OmniSaar

**The core of every customer operation.**

OmniSaar is an open-source, white-label, agent-native Customer Operations platform for running CRM, conversations, commerce, Email Marketing, social operations, automations, reporting and AI agents in one operational context.

OmniSaar is a long-lived fork of [Twenty](https://github.com/twentyhq/twenty). We preserve Twenty's upstream history and applicable license notices while developing OmniSaar as an independent product with its own name, roadmap and user experience.

> **Project status:** early platform-foundation development. The repository is public for open-source development, but the OmniSaar product layer is still being built and should not yet be treated as a stable production release.

## Product domains

- **CRM** — people, companies, leads, opportunities, tasks and customer context.
- **Inbox** — email, WhatsApp, Instagram, Messenger, Telegram, SMS and web chat.
- **Commerce** — customers, products, orders, payments, fulfillment and support context.
- **Email Marketing** — audiences, segments, campaigns, newsletters, templates, automations, consent and analytics.
- **Social** — social operations and channel workflows.
- **Agents** — native and external agents with scoped tools, permissions and approval gates.
- **Automation** — triggers, workflows, schedules, jobs, retries and approvals.
- **Reports** — operational, customer, workflow and agent reporting.
- **Integrations** — provider connectors and shared integration contracts.
- **White Label** — workspace branding, domains, terminology, modules, policies and tenant configuration.
- **Activity Ledger** — auditable human, agent, workflow and provider actions.

## First architecture-proving milestone

```text
Shopify
  ↓
Customer / Order
  ↓
WhatsApp
  ↓
OmniSaar Inbox
  ↓
Identity Resolution
  ↓
Hermes
  ↓
Human Approval
  ↓
Outbound Reply
  ↓
Activity Ledger
```

The acceptance contract lives in [`docs/omnisaar/FIRST-VERTICAL-SLICE.md`](./docs/omnisaar/FIRST-VERTICAL-SLICE.md).

## Architecture and project governance

OmniSaar deliberately separates product code from product strategy and operating knowledge:

- Product code: `OmniSaar/omnisaar`
- Strategy, PRDs and architecture: `OmniSaar/core`
- Current state and routing: `OmniSaar/Progress-Memory`
- Workflows and runbooks: `OmniSaar/Process-and-Workflows`
- Reusable agent skills: `OmniSaar/Skills`
- Operational automation and evaluations: `OmniSaar/Automation`
- Design and white-label rules: `OmniSaar/design-system`

Start with [`docs/omnisaar/README.md`](./docs/omnisaar/README.md) for fork-specific engineering context.

## Upstream Twenty relationship

This repository is a real GitHub fork of `twentyhq/twenty` and preserves its source history.

For local development, add the upstream remote if it is not already configured:

```bash
git remote add upstream https://github.com/twentyhq/twenty.git
git fetch upstream --tags
```

Upstream changes are integrated through reviewable `upstream-sync/*` branches rather than merged directly into OmniSaar `main`. See [`docs/omnisaar/UPSTREAM.md`](./docs/omnisaar/UPSTREAM.md).

## Development foundation

The underlying Twenty codebase is an Nx / Yarn 4 monorepo built primarily with TypeScript, React, NestJS, PostgreSQL and Redis. Until OmniSaar-specific developer tooling replaces or wraps these workflows, follow the engineering commands and conventions documented in [`AGENTS.md`](./AGENTS.md) and the existing upstream package documentation.

Common upstream development commands include:

```bash
bash packages/twenty-utils/setup-dev-env.sh
yarn start
```

## Reference deployment

**Sabpuja CRM — powered by OmniSaar** is the first reference deployment and production proving ground. Sabpuja-specific configuration must remain tenant configuration rather than shared product assumptions.

## License and attribution

This fork retains Twenty's upstream [`LICENSE`](./LICENSE) and file-level license notices. The repository is mostly AGPLv3, with separately identified Enterprise-licensed and MIT-licensed portions as described in that license file.

Twenty's name and logo remain subject to Twenty's trademark policy. OmniSaar is an independent fork and is not presented as an official Twenty offering. See [`NOTICE.md`](./NOTICE.md) for attribution context.

## Contributing

Organization-wide contribution and security policies live in the `OmniSaar/.github` repository. Before making substantial changes, read this repository's [`AGENTS.md`](./AGENTS.md) and route requirements/decisions to the canonical owning repository.
