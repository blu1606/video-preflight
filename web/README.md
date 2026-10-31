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
| `/` | Upload on one screen: video, shop (status card) and SKU, platforms, collapsed advanced options. Submit uploads, then opens `/analyze?video=<id>&autorun=1` |
| `/analyze?video=<id>` | Result: streamed steps, score, timeline markers on the video, fixes, Policy, groups, shop context, FastMoss market charts, and the "Báo cáo đầy đủ" dialog |
| `/analyze` | Video library ("Lịch sử") |
| `/shops`, `/shops/:id`, `/videos/:id`, `/data` | Older dashboards, unchanged |
| `/mockup-v2/` | Design reference only (static HTML, fake data). The React app takes no data from it |

`/` used to serve the mockup. It is now the React app; the mockup stays at `/mockup-v2/`.

## Data flow

- Analysis runs over SSE: `GET /py/videos/{id}/analyze/stream` (`src/lib/analysis-stream.js`). If the stream cannot open, the client falls back to `POST /py/videos/{id}/analyze` and replays `result.trace`. Both paths feed one reducer (`src/lib/analysis-run-reducer.js`).
- `src/lib/analysis-view-model.js` turns a backend `result` (or the partial step outputs of a running analysis) into what the page shows. Groups and criteria come straight from `result.scores`. `src/lib/labels.js` only translates display names.
- The overall score follows `docs/uiux-requirements.md` §5 (`src/lib/score-calculator.js`).
- Paid OpenAI steps (`extract=force`, `decisions`, `cross_check_agent`, `claims_llm`, `localize`) stay off unless ticked in "Tùy chọn nâng cao".
