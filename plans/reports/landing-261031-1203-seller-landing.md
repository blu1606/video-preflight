# Seller landing (route `/`) and Studio move to `/studio`

Date: 2026-10-31 (Asia/Bangkok). Surface 1 of `plans/261031-1201-landing-login-shop-select/brief.md`. Not committed.

## What changed

- `web/src/App.jsx`: `/` renders `LandingPage`; Studio moved to `/studio`; `/upload` now redirects to `/studio`.
- `web/src/components/layout.jsx`: nav item "Kiểm tra video" points to `/studio`.
- `web/src/pages/analyze-page.jsx`, `web/src/pages/overview-page.jsx`: Studio links (`to="/"`) now `to="/studio"`.
- `web/src/pages/landing-page.jsx` (new): the landing page.
- `web/src/pages/landing.css` (new): scoped styles for the landing.
- `web/public/landing/studio-preview.webp` (new): hero image, cropped from a real screenshot of the running Studio (`/studio`, shop SHOP001, video SHOP001-VID01).
- `web/index.html`: title and meta description.

Not changed: `web/src/studio/app-bar.jsx` still has its brand link to `/`, which now lands on the product page. Studio content is otherwise untouched. No backend, `db/`, `data/`, or `fixtures/` files were touched.

## Design decisions (impeccable, recorded without a user)

- Mode: Persuade. Visual world inherited from `web/public/mockup-v2/` and its tokens (`--mk-*` in `index.css`), since it is an established world in code. No DESIGN.md written; the surface is inside that world and the flow does not require one.
- Structure, not cards: hero (headline, lede, CTA, dark stage with the real Studio capture), problem as label/sentence rows, 3 numbered steps (sequence information), provenance statuses and policy states as divided lists, a data-sources list, one closing band with the same CTA, and a footer disclaimer. No eyebrow labels, no icon-card grid, no gradient text, no glass.
- CTA: single primary "Đăng nhập bằng Shopee" to `/login`, in `--mk-accent-ink` (#c8381c) so white text passes 4.5:1 (the brighter accent #ee4d2d gives about 3.2:1).
- Motion: one entrance (hero copy and capture rise in), disabled under `prefers-reduced-motion`.
- Layout is plain CSS, not Tailwind utilities. Reason: the running dev server's Tailwind scan did not pick up utilities in new files until a restart, so arbitrary and responsive classes were missing in dev. The production build generates them, but I could not restart the shared dev server to verify. Plain CSS renders the same in both.

## Content rules

- Every number on the page is a fact from PRODUCT.md or the codebase: 9 synthetic shops, 24 videos with outcomes reported by Clipcat (unverified), FastMoss and Google Shopping via SerpAPI with crawl dates, policy baseline with source URLs, Decisions API batched call with 5-level rubric.
- Provenance statuses use the keys from PRODUCT.md (REAL, MOCK, INFERRED, MISSING). Policy states use the labels from `src/lib/labels.js`. No "đạt".
- Shopee and TikTok Shop are named only as platforms. No Shopee logo or UI imitation. Footer says Preflight is not affiliated with either.
- Disclosure: the login is a simulation and shop/SKU data is test data, stated near the CTA and in the sources list.

## Verification

- Dev server (5180) at 1440 and 1920 px desktop: hero, problem, steps, proof, sources, closing band checked visually.
- Phone width: Chrome headless enforces a minimum window width of about 500 px, so a true 390 px render was not possible. Checked at 500 px: no horizontal overflow, steps and rows stack correctly.
- `pnpm --dir web exec vite build`: passes.
- `oxlint` on touched files: clean. Pre-existing unused-import warnings in `overview-page.jsx` were not touched by me.
- `node --test src/lib/*.test.js src/studio/*.test.js` (the project's test runner, no vitest): 108/108 pass.

## Concerns

- `/login` is not built (out of scope). The CTA links there, so until the other task lands, it renders an empty route. No fake redirect was added, per the brief.
- Hero screenshot shows the Studio's current state (score 55/100, "Policy: 6 cần xem lại"). It is a real capture of the seeded data, but it will go stale if the Studio or seed data changes; regenerate `web/public/landing/studio-preview.webp` then.
- Dev server Tailwind staleness (above) will persist until the next dev server restart for any new Tailwind-dependent file; not caused by this change, but worth knowing.

Status: DONE_WITH_CONCERNS
