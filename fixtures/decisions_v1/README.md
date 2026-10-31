# E-commerce Decisions Question Bank v1

- `decision_question_bank.json`: full registry with question, five explicit levels, phase, feature dependencies, provisional weights, skip policy.
- `api_template_*.json`: OpenAI Decisions API request-shaped templates (replace `input` with real evidence; filter questions by `required_features` before invoking).
- `example_input_teashell.json`: illustrative synthetic partial evidence.

IMPORTANT: Templates intentionally include questions requiring data absent from example. Never submit all question sets automatically. Only use eligible questions. `score` returns a probability-weighted level index (0..4), NOT real conversion probability. Scores are human-designed heuristics.

When data is mocked set simulation mode. No mock values may silently flow into production claims. Apply `missing_behavior` in application preflight; it is not a native Decisions API feature.

Sources: https://developers.openai.com/api/docs/guides/decisions and https://developers.openai.com/api/reference/resources/decisions/methods/create
