# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Primary: seller** on TikTok Shop / Shopee (shop owner or content person) who checks a sales video **before posting**, attached to one of their shop's SKUs. Job: know whether the video is ready, why, and exactly what to fix (with the moment in the video).
- **Secondary: competition judges** watching the prototype demo. They need to see that the result comes from researched business logic and a transparent agent pipeline, not a generic prompt. The technical depth (agent flow, Decisions questions, schema features, policy rules) must be reachable from the seller's flow, not a separate app.

## Product Purpose
Seller uploads a video, picks the shop and SKU, and the system scores the video against video content, SKU/shop data, crawled market data and platform policies. Output: scores with coverage, a policy gate, reasons, and prioritized fixes tied to timestamps. Success in the demo: a judge follows one run end to end and can trace any number back to its source.

## Positioning
Every number is traceable (REAL / MOCK / MISSING / INFERRED with evidence); missing data is "not scored", never 0. Judgement criteria come from the OpenAI Decisions API with explicit 5-level rubrics and probabilities per level; measurable signals and calibration come from real crawled market data; policy is checked against paraphrased official platform rules with verbatim quotes and is never declared "approved".

## Operating Context
- Demo: presenter drives a laptop projected on a large screen (desktop ~1440–1920 px); judges watch from a distance, so text and charts must read from afar.
- Flow: choose shop (navbar) → shop profile and shop health with data-source disclaimer → choose video and SKUs (SKUs mapped to the video first, other SKUs below, Shopee link input) → description + hashtags (AI quick-fill) → Analyze → streamed agent flow → results.
- Run time: ~3 s with caches, up to ~95 s with a fresh VLM extraction. Paid OpenAI steps are confirmed before running.
- Stack: React 19 + Vite + Tailwind v4 + shadcn/ui + Recharts in `web/`; FastAPI (`/py`) and json-server (`/api`) behind the Vite proxy.

## Capabilities and Constraints
- Backend business logic is the source of truth (scores per group: Viral, Conversion, SKU & market, Shop health; policy as a separate gate; Decisions question bank; policy rules; quality gate; fixes). UI must not invent scores, questions or mappings.
- Analysis trace: every step has agent, tool, input, output, status, timing; a streaming endpoint exists (SSE).
- Decisions API is one batched call; per-question reveal in the UI is a presentation of that batch, and must say so.
- Terminology: keep English for Hook, CTA, Viral, Conversion, Policy, Decisions API, agent, trace, coverage, SKU, GMV.
- Undecided: final overall-score weights (Viral 0.30 / Conversion 0.40 / SKU 0.20 / Shop health 0.10 pending confirmation).

## Brand Commitments
- UI language Vietnamese, technical keywords in English; content data (product names, transcript, claims) stays Vietnamese.
- Shop/SKU seed data is synthetic: always labelled as such, with its source, and stated as test-only, not a true picture of the shop.
- Policy is only "cần xem lại", "không phát hiện vi phạm" or "chưa đủ dữ liệu"; never "đạt"/approved.
- `web/public/mockup-v2/` is the binding visual reference, including its video edit / add-video section.

## Evidence on Hand
- Real videos: 24 TikTok Shop videos with reported outcomes (Clipcat, unverified), files in `data/`.
- Crawled market snapshots (FastMoss, Google Shopping via SerpAPI) with source and crawl date: `fixtures/market/`, provenance in `docs/market-data-provenance.md`.
- Synthetic Shopee seed: 9 shops with SKUs, videos and performance (`fixtures/shopee_seed/`).
- Policy baseline with official source URLs: `fixtures/policy_baseline_v01/`.
- No real seller accounts, testimonials or verified shop data exist; never fabricate them.

## Product Principles
1. Traceable over impressive: a number without a source does not ship.
2. The seller's question first ("đăng được chưa, sửa gì"), the judge's proof one click away.
3. Honest about uncertainty: show coverage, simulated data and placeholders instead of hiding them.
4. Show the machinery: the agent pipeline and Decisions reasoning are part of the product, not debug output.
