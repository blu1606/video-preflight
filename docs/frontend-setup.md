# Frontend setup

The Vietnamese saved-data seller interface lives at `/demo` in `web/`; `/` keeps the concurrently developed Studio and its backend workflows. Each route loads its own stylesheet, with navigation links between them. It reads the exported `db.json` snapshot: nine synthetic shops, 45 SKUs, 29 video records and 39 saved video analyses. It does not require the original project or a running backend.

Use Node.js 22.19+ and pnpm 11.25.0 (workspace version).

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
# Open http://127.0.0.1:5180/demo
```

## What works

- Shop, video and SKU selection; saved analysis history; original overall/group scores and coverage. Missing scores remain unscored, including accessible meter semantics.
- Prioritized fixes, Policy per platform and specification checklists. Timestamp buttons seek the local video or select a saved frame when media is absent.
- Audit from the seller screen: trace input/output, explicitly labelled 20x replay, extraction frames/transcript/model metadata, Decisions probabilities and feature provenance, score breakdown and cross-check.
- Shop GMV/traffic charts from synthetic seed metrics; market prices and FastMoss 28-day sales charts with source/date links.
- Local video preview and draft editing for caption, hashtags, SKU, platform, sponsorship and goals. Drafts are stored in this browser and can be exported as JSON. The selected local filename is remembered, but the binary must be selected again after closing/reloading.

No new analysis, AI caption generation, network upload, publish approval or platform publishing is implemented. Draft changes never change historical scores. A separate Studio/backend was integrated from concurrent remote work; `/demo` deliberately remains the temporary read-only database UI requested here. Data errors and videos without saved runs have explicit states.

## Data and local media

`data/fixtures/app/catalog.json` and `runs/*.json` are read-only exports of the local database, with a SHA256 source identifier. Scores and overall objects are unchanged. Absolute machine paths in narrative/trace references are replaced with source basenames. The export includes only the application catalog, daily shop metrics and video run records; the full database remains ignored.

To refresh deliberately after changing the local database:

```powershell
pnpm data:sync
```

Review the exported diff and provenance before committing. This command needs `data/db/db.json`; normal install/dev/build does not. It never modifies the source database or video files.

`scripts/demo-assets.ts` serves an exact allowlist of catalog/runs, market snapshots, extracted JSON, frames and SKU images under `/demo/`. Development additionally serves local `data/videos/` files under `/media/` with byte-range support. The production build includes the small data/images, **never videos**. A fresh clone/production preview uses saved frames where available. See [data layout](data-layout.md) to obtain local video files.

## Validation

```powershell
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm preview
```

`pnpm build` runs TypeScript checks before bundling. Browser tests cover history, evidence drilldown, seeking, shop switching, draft persistence, missing media, error recovery and 375px layout. `node_modules`, `dist`, test artifacts, video files and the original database remain ignored.

## UI stack

Tailwind v4 runs through `@tailwindcss/vite`; tokens are in `src/index.css`. shadcn/ui uses Radix Nova and the Button component, configured by `components.json`. The `@/` alias resolves to `src/` in TypeScript and Vite. Recharts is loaded with the shop view. The current interface is light, Vietnamese, with a restrained green accent and Geist's Vietnamese subset.

Add components from `web/` using `pnpm exec shadcn add card`.

References: [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [shadcn with Vite](https://ui.shadcn.com/docs/installation/vite), [Recharts](https://recharts.github.io/en-US/guide/installation/).
