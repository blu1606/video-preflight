# Frontend setup

The React + TypeScript starter lives in `web/`, scaffolded with Vite. It currently shows the starter screen; product workflows and backend integration are not implemented.

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
