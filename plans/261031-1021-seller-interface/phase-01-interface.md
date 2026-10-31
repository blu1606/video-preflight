# Interface implementation

Read PRODUCT.md, docs/uiux-requirements.md and docs/data-layout.md. Latest UI requirements resolve language to Vietnamese and overall calculation to backend-provided values. mockup-v2 and backend are absent.

1. Export an allowlisted read-only catalog and saved run files from local db.json; preserve scores, annotate provenance. Record database hash. Keep originals ignored.
2. Serve exported JSON and existing images through an allowlisted Vite plugin; build emits these assets, excludes video. Local dev serves existing videos with Range support.
3. Build seller selection/results, draft preview, audit trace/Decisions/extraction and shop/market views.
4. Validate source mapping, missing scores, history isolation, local media seek, mobile layout and empty states. Update setup docs and commit/push scoped changes.

Files: web/src/features/preflight, web/src/App.tsx, web/src/index.css, web/scripts, web/vite.config.ts, data/fixtures/app, docs/frontend-setup.md. No original data changes.

Risk: historical snapshots include synthetic dependencies; explicit labels always visible. No new analysis or persistence is implied. Rollback: revert interface commit; local source data untouched.
