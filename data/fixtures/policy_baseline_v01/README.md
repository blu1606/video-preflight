# E-commerce Policy Baseline v0.1

Selected, paraphrased rules from official TikTok, TikTok Shop and Shopee pages; Meta access was blocked and its three rules are provisional, not source-verified.

- `sources.json`: canonical URL registry and access status
- `rules.json`: normalized, scoped policy checks; `required_features` are your video/SKU/ads extraction inputs
- `test_cases.json`: synthetic positive triggers for smoke testing
- `manifest.json`: counts and dataset version

Do not infer APPROVED when features are missing. Return `unknown` or `needs_review`. Use `source_id` to show the official policy link for each finding. This is an initial subset, not all policy.
