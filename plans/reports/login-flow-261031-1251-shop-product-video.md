# Operate screens: login, shop, product, video (route `/login` to `/shops/:id/products/:skuId/add-video`)

Date: 2026-10-31 (Asia/Bangkok). Surfaces 2, 3, 3b and 4 of `plans/261031-1201-landing-login-shop-select/brief.md`. Not committed.

## What was built

- `/login`: simulated Shopee Open Platform authorization. Prefilled demo account, no password field, scope list, the 9 shops named, "Cho phép" goes to `/shops/select`. "Mô phỏng" tag and bar always shown. No Shopee logo or layout copy.
- `/shops/select`: 9 shop cards (name, category, shop id, shop age, shop rating, GMV 30 days, orders 30 days, 7-day GMV trend against the previous 7 days, first 3 SKUs with thumbnails). Labelled as synthetic. Card goes to `/shops/:id`.
- `/shops/:id`: shop title, Shopee link input (calls the existing `POST /py/listings/resolve`, shows the listing found, does not map it to a SKU), SKU table (image, name, SKU id, price with original price, rating and review count, stock, video count). Row goes to the add-video step.
- `/shops/:id/products/:skuId/add-video`: SKU summary, upload button (existing `POST /py/videos/upload` with `shop_id` and `sku_id`, progress bar, then opens Studio with the new video), video cards grouped as "Video của SKU này" and "Video khác của shop". Each card is a `<video preload="metadata" src="/media/...#t=1">` frame, no generated thumbnail. Card opens `/studio?shop=<id>&video=<videoId>`.
- Loading (skeleton), error (with retry), and empty states on every screen. Back links on every screen. Header shows the flow position.

Visual world: mockup-v2 tokens (`--mk-*`) and the landing's plain-CSS approach, so the dev server's Tailwind scan is not a factor. Amber simulation bar, orange accent only on primary actions and trend-down/up colours, tabular numerals for money and counts.

## Files

New:
- `web/src/pages/operate.css`
- `web/src/pages/operate-shell.jsx` (header with flow steps, simulation bar, state blocks)
- `web/src/pages/login-page.jsx`
- `web/src/pages/shops-select-page.jsx`
- `web/src/pages/shop-products-page.jsx`
- `web/src/pages/add-video-page.jsx`
- `web/src/lib/shop-trend.js` (GMV trend arithmetic, category labels)
- `web/src/lib/shop-trend.test.js`

Changed:
- `web/src/App.jsx`: new routes. The old shop detail page (`ShopPage`) moved from `shops/:id` to `shops/:id/profile` (it stays inside the old Layout).
- `web/src/pages/overview-page.jsx`: "Xem chi tiết" link to `/shops/:id/profile`.
- `web/src/pages/video-page.jsx`: shop link to `/shops/:id/profile`.

Not changed: `api.py` (no restart needed), `db/`, `data/`, `fixtures/`, `landing-page.jsx`, Studio.

## Verification

- `pnpm --dir web exec vite build`: passes.
- `oxlint` on all touched new files and the two link edits: clean. Pre-existing unused-import warnings in `overview-page.jsx` remain (not mine).
- `node --test src/lib/*.test.js src/studio/*.test.js`: 113/113 pass (includes 5 new tests).
- Headless Chrome screenshots at 1440, 1920 and 500 px for all four screens. Layout checked: no horizontal overflow at 500 px, SKU table collapses to product plus metrics line, flow header shows only the current step on phone width.
- Not verified: clicking through the flow in a real browser (no automation available here), the upload, and the video preview frame (headless screenshots show a dark stage; `preload="metadata"` plus `#t=1` is the approach, but a real first frame was not confirmed).

## Concerns

1. **json-server (:3101) is serving stale `local_file` values.** `db/db.json` on disk now has `SHOP001/vn-beauty-467796.mp4`, but the running server returns bare `vn-beauty-467796.mp4`. The data-split report says `/media/<local_file>` works with the folder path. The add-video page builds the media URL from the shop folder when `local_file` has no `/`, so it works either way. **Controller: restart json-server on :3101** so Studio and the API read the current db. Studio itself was not checked for this.
2. **Studio preselects shop and video, not SKU.** Studio takes its SKU from `video.sku_id`. For videos linked to the chosen SKU this is the same SKU. For "Video khác của shop", the card states that Studio uses that video's own SKU. Changing Studio to honour a `sku` param was out of scope.
3. **Shopee link is display-only.** `/py/listings/resolve` returns a listing, but the seed has no mapping from listings to our SKUs, so the result is shown and not attached to anything. Says so on the screen.
4. **Shop status is arithmetic, not a verdict.** Only 4 shops have a saved `shop_diagnosis`, so the cards show the 7-day GMV trend (from `shopDailyMetrics`) and the facts, with no diagnosis score. The seed has no shop description field, so the card shows category and age instead.
5. **Route change for old shop detail.** `/shops/:id` is now the product picker, as the brief requires. Anyone who bookmarked the old detail page needs `/shops/:id/profile`.

Status: DONE_WITH_CONCERNS
Summary: Built `/login`, `/shops/select`, `/shops/:id` and `/shops/:id/products/:skuId/add-video` in the mockup-v2 visual world, wired to the existing json-server and FastAPI endpoints. Studio is unchanged and receives shop and video through its existing query params. Build, lint and the node tests pass; the screens are checked at 1440, 1920 and 500 px, but the click-through and video preview frame are not verified in a browser.
