# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Target customer decided 31/10/2026; reasoning, evidence and citations in `docs/target_customer.md` (charts: `docs/target_customer.pdf`).
- **Primary: brand / shop in sensitive categories** (cosmetics, health supplements, mother & baby) selling on Shopee / TikTok Shop that works with KOC, KOL and affiliate creators. Daily user is the reviewer (booking / content specialist) who approves a creator's video **before it is posted**; buyer is the marketing lead or shop owner. Job: decide approve or send back, with grounded reasons and timestamped fixes the creator can act on, and keep a record that holds up if a regulator or platform asks.
- **Secondary: the creator / KOC submitting the video** to that brand, who can self-check before submitting (free entry channel, not the paying customer).
- **Secondary: competition judges** watching the prototype demo. They need to see that the result comes from researched business logic and a transparent agent pipeline, not a generic prompt. The technical depth (agent flow, Decisions questions, schema features, policy rules) must be reachable from the reviewer's flow, not a separate app.
- **Not the first customer:** part-time affiliate creators (posting is nearly free, so testing on the market is cheaper than a tool) and mass AI-video producers.

## Product Purpose
A brand reviewer receives a creator's video for one of the brand's SKUs and checks it before it goes live. The system scores the video against video content, SKU/shop data, crawled market data and platform policies. Output: scores with coverage, a policy gate, reasons, and prioritized fixes tied to timestamps, ready to send back to the creator. Why it matters: in these categories one non-compliant video can mean fines, shared liability between brand and KOL, platform penalties and wasted booking fees, far more than the cost of checking first. Success in the demo: a judge follows one run end to end and can trace any number back to its source.

## Positioning
Every number is traceable (REAL / MOCK / MISSING / INFERRED with evidence); missing data is "not scored", never 0. Judgement criteria come from the OpenAI Decisions API with explicit 5-level rubrics and probabilities per level; measurable signals and calibration come from real crawled market data; policy is checked against paraphrased official platform rules with verbatim quotes and is never declared "approved".

## Operating Context
- Demo: presenter drives a laptop projected on a large screen (desktop ~1440–1920 px); judges watch from a distance, so text and charts must read from afar.
- Flow: landing (`/`) → simulated Shopee sign-in (`/login`) → choose shop (`/shops/select`) → choose product/SKU (`/shops/:id`) → choose the creator's video from the shop's library or upload one (`/shops/:id/products/:skuId/add-video`) → Studio (`/studio`): description + hashtags → Analyze → streamed agent flow → results and fixes to send back.
- Reviewer workflow this plugs into: negotiate and contract the KOC → send samples + brief → approve script → creator films a demo → approve demo video → post → move the KOC to long-term affiliate. Preflight sits at the script and demo-video approval steps.
- "Shop health" is context, not part of the video score. For this customer the more useful context is the submitting creator's health (past violations, past conversion, audience fit); not built yet.
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
- Target-customer research (legal exposure, review workflow, pricing benchmarks) with confidence levels and sources: `docs/target_customer.md`. No customer interviews have been done yet.
- No real seller accounts, testimonials or verified shop data exist; never fabricate them.

## Product Principles
1. Traceable over impressive: a number without a source does not ship.
2. The reviewer's question first ("duyệt hay trả về, sửa gì"), the judge's proof one click away.
5. Every reason to send a video back must be specific enough for the creator to fix and grounded enough for the brand to defend.
3. Honest about uncertainty: show coverage, simulated data and placeholders instead of hiding them.
4. Show the machinery: the agent pipeline and Decisions reasoning are part of the product, not debug output.
