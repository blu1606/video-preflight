# Video Intelligence Lab · web

React 19 + Vite + Tailwind v4 + shadcn/ui (`src/components/ui`), Recharts, lucide-react.

```bash
pnpm install
pnpm lab                  # json-server :3101 + FastAPI :8100 + Vite :5180
pnpm lint && pnpm build
node --test src/lib/*.test.js   # pure view-model, stream reducer, timeline/marker helpers
```

## Routes

| Path | What |
|---|---|
| `/` | Preflight landing for brand/shop reviewers: real sample video with timestamped findings, workflow, data provenance and FAQ. Playback is opt-in; play/pause, mute and keyboard seeking are supported. |
| `/login` | Simulated Shopee authorization; no real password or account connection. |
| `/studio` | Video review Studio. The landing's sample link selects `SHOP001` and `SHOP001-VID01`. |
| `/analyze?video=<id>` | Result: streamed steps, score, timeline markers on the video, fixes, Policy, groups, shop context, FastMoss market charts, and the "Báo cáo đầy đủ" dialog |
| `/analyze` | Video library ("Lịch sử") |
| `/shops`, `/shops/:id`, `/videos/:id`, `/data` | Older dashboards, unchanged |
| `/mockup-v2/` | Design reference only (static HTML, fake data). The React app takes no data from it |

`/` used to serve the mockup. It is now the React app; the mockup stays at `/mockup-v2/`.

The landing uses local assets in `public/landing/` and a precomputed sample in
`src/pages/landing-page.jsx`; playing it does not start an analysis or require the
backend. Findings stay readable if the sample video cannot load. The login/shop
flow and live Studio still require the database and API services.

Landing branding uses the user-supplied transparent `public/brand/shopee-logo.png`
as platform context, with `#EE4D2D` sampled from that asset. Preflight remains the
product identity. Landing headings and body use Be Vietnam Pro; its scoped styles
do not change typography in Studio or other routes.
The same row includes `public/brand/tiktok-logo.png` and `meta-logo.png`, derived
from the user's supplied images with the baked-in checkerboard backgrounds
removed. These identify platform context, not account integrations or endorsements.

The expandable workflow explanation retains the sample run console and pipeline map
from `src/pages/landing-run-console.jsx`. It replays recorded output, not a live run.

## Data flow

- Analysis runs over SSE: `GET /py/videos/{id}/analyze/stream` (`src/lib/analysis-stream.js`). If the stream cannot open, the client falls back to `POST /py/videos/{id}/analyze` and replays `result.trace`. Both paths feed one reducer (`src/lib/analysis-run-reducer.js`).
- `src/lib/analysis-view-model.js` turns a backend `result` (or the partial step outputs of a running analysis) into what the page shows. Groups and criteria come straight from `result.scores`. `src/lib/labels.js` only translates display names.
- The overall score follows `docs/uiux-requirements.md` §5 (`src/lib/score-calculator.js`).
- Paid OpenAI steps (`extract=force`, `decisions`, `cross_check_agent`, `claims_llm`, `localize`) stay off unless ticked in "Tùy chọn nâng cao".
