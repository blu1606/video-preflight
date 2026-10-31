# Frontend setup

The React + TypeScript starter lives in `web/`, scaffolded with Vite. It currently shows a minimal starter screen with a shadcn Button; product workflows and backend integration are not implemented.

Use Node.js 22.19+ and pnpm 12.14.0.

From the repository root:

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Validation and production preview:

```powershell
pnpm lint
pnpm build
pnpm preview
```

`pnpm build` runs TypeScript checks before bundling. Dependencies are pinned by `web/pnpm-lock.yaml`. `node_modules` and `dist` are ignored. Local videos and the large database snapshot remain ignored by the root `.gitignore`; see [data layout](data-layout.md).

## UI libraries

Tailwind CSS v4 runs through `@tailwindcss/vite`. Theme tokens and base styles live in `web/src/index.css`. shadcn/ui uses the Radix Nova preset with neutral colors; configuration is in `web/components.json`, with components in `web/src/components/ui/` and the `cn` helper in `web/src/lib/utils.ts`.

The `@/` alias resolves to `web/src/` in both TypeScript and Vite. To add components from `web/`:

```powershell
pnpm exec shadcn add card
```

Recharts is installed and available for chart components. No product scores or chart data are fabricated by this setup. Dark theme tokens are available via a `.dark` class; a theme switcher is not implemented.

Installation references: [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite), [shadcn with Vite](https://ui.shadcn.com/docs/installation/vite), [Recharts](https://recharts.github.io/en-US/guide/installation/).
