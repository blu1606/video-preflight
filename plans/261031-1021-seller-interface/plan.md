# Seller interface

Status: implementation and verification complete. Git delivery follows the verified scope.

Outcome: a Vietnamese seller flow backed by the imported database snapshot: shop/video/SKU selection, saved results, timestamped fixes, Policy, audit evidence, and shop/market context.

Constraints: original scores and provenance; missing is never zero; no paid API calls; videos/database stay ignored. Backend is absent; the user chose temporary db.json data. New-video preview and editable drafts remain local and never produce fabricated analyses.

Non-goals: implementing analysis models, deployment, platform publishing, rewriting imported source data.

Acceptance: saved results and historical runs match database; all nine shops work; selectable video/SKU, trace replay explicitly labelled historical, frames/transcript/Decisions drilldown, empty/error states; responsive 375px and desktop; build/lint and interaction checks pass; scoped commit pushed.

Implementation: [phase](phase-01-interface.md).

Validation: lint and TypeScript/production build pass; seven Playwright E2E tests pass including all 39 saved histories, missing media, draft persistence, retry and unscored semantics. Production preview verified saved results, frame fallback and shop/FastMoss charts. All 39 exported score/overall objects match the source database; credential scan found no secrets.

Concurrent integration: origin/main added Studio and backend while this UI was in progress. Preserve Studio at `/`, provide snapshot UI at `/demo`, lazy-load separate styles, retain backend proxies and root pnpm workspace lockfile. Source records remain read-only; the snapshot UI does not mutate the new backend database.
