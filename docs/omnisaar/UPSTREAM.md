# Upstream Twenty strategy

## Relationship
- Canonical OmniSaar product: `OmniSaar/omnisaar`
- GitHub fork parent/source: `twentyhq/twenty`
- Default branch: `main`

The GitHub fork relationship preserves upstream history. Local developer clones should normally use:

```bash
git remote -v
git remote add upstream https://github.com/twentyhq/twenty.git
git fetch upstream --tags
```

if an `upstream` remote is not already configured.

## Sync policy
1. Never merge upstream changes directly into OmniSaar `main` without validation.
2. Create an `upstream-sync/<date-or-version>` branch from current OmniSaar `main`.
3. Fetch the latest `twentyhq/twenty` `main` and merge it into the sync branch.
4. Resolve conflicts by preserving accepted OmniSaar product behavior while retaining upstream fixes where compatible.
5. Run the relevant upstream and OmniSaar verification suites.
6. Review licensing/migration/security impact.
7. Merge through a reviewed pull request.
8. Record the resulting upstream commit and any compatibility notes in `OmniSaar/Progress-Memory`.

## Modification policy
OmniSaar is intentionally a long-lived product fork. Deep core changes are allowed when they create durable product value, but changes should be isolated and documented enough that future upstream reconciliation remains practical.

Prefer extension seams when they fit. Do not distort the product merely to avoid touching upstream code.

## Licensing
Preserve applicable upstream license headers, notices and attribution. Do not assume every file has the same licensing status; Twenty includes differently licensed portions. Any new OmniSaar code should receive the project-approved license policy before the first public release containing substantial original implementation.
