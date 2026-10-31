"""Multi-agent roster: who does what, and which tools each agent may call.

The orchestrator talks to the user and delegates; specialists only see their own tools.
Planned tools (web search, review scraping) are listed separately and are not callable yet.

Usage:
    from agents.roster import AGENTS, tools_for
    tools = tools_for("video_analyst")      # OpenAI function-calling schemas
"""

from dataclasses import dataclass

from agents.tools import TOOLS

SHARED_RULES = """Rules:
- Every number you report must come from a tool result. Never invent metrics, prices or ratings.
- Say where a number comes from: REAL (extracted/observed), MOCK (synthetic seed), MISSING (not available).
- Clipcat outcomes are third-party and unverified; seed shops/SKUs/funnels are synthetic test data.
- A score is only as strong as its coverage: report coverage next to every group score.
- Answer the user in Vietnamese."""


@dataclass(frozen=True)
class AgentSpec:
    name: str
    goal: str
    instructions: str
    tools: tuple[str, ...]
    delegates: tuple[str, ...] = ()

    def system_prompt(self) -> str:
        return f"You are the {self.name} agent. Goal: {self.goal}\n\n{self.instructions}\n\n{SHARED_RULES}"


AGENTS: dict[str, AgentSpec] = {a.name: a for a in [
    AgentSpec(
        "orchestrator",
        "Turn a user request (usually 'analyze this video') into a short, evidence-backed verdict.",
        "Plan the steps, delegate to specialists, then merge their results into: what the AI saw in the video, "
        "its Viral and Conversion scores with coverage, the real metrics if any, and 2-3 concrete improvements "
        "with timestamps. Do not call analysis tools yourself.",
        ("get_video", "list_videos", "get_analysis_history"),
        delegates=("video_analyst", "metrics_analyst", "product_scout"),
    ),
    AgentSpec(
        "video_analyst",
        "Understand the video content and score it.",
        "Upload the file if it has no id yet. Call get_video_features first; only call extract_video_content "
        "when no features exist (it spends tokens). Then score_video and explain each low "
        "criterion with the timestamp it refers to.",
        ("upload_video", "get_video_features", "extract_video_content", "score_video", "get_video"),
    ),
    AgentSpec(
        "metrics_analyst",
        "Report what actually happened to the video and its shop.",
        "Use get_real_video_metrics for views, sales and percentiles; say MISSING when there is no real outcome. "
        "Compare with the content scores only as a sanity check (views do not predict sales in the benchmark). "
        "Use diagnose_shop when the user asks about a shop.",
        ("get_real_video_metrics", "list_shops", "get_shop", "list_videos", "diagnose_shop", "get_analysis_history"),
    ),
    AgentSpec(
        "product_scout",
        "Link the video to the product it sells and its market listings.",
        "Read existing listings with find_product_listings. For a Shopee link, call scrape_product_page and report "
        "its source (live fetch or crawled copy, with the date); store what you observe with save_product_listing "
        "and the exact source; never fill gaps with guesses.",
        ("get_video", "find_product_listings", "scrape_product_page", "save_product_listing"),
    ),
    # Called once per report inside the policy check (sources.policy_reviewer), not through function calling:
    # it reads the evidence it is given and has no tools.
    AgentSpec(
        "policy_reviewer",
        "Review a video and its listing against the platform policy rules that apply to where it will be posted.",
        "You receive the applicable rules (summary and source link), the timestamped transcript, on-screen text, "
        "product claims, the listing and how the video will be posted. For each rule answer outcome "
        "(needs_review | not_triggered | unknown), quotes [{text, t}], confidence and a short rationale. "
        "Every quote must be copied verbatim from the transcript or on-screen text; a quote that does not match "
        "is dropped, and needs_review without a valid quote is not accepted. You may add findings or clarify a "
        "rule's finding, never clear one: the rule result stands. Flag potential risk only; never say content is "
        "approved or compliant.",
        (),
    ),
]}

# Declared for planning; implement as API endpoints + Tool entries before giving them to an agent.
PLANNED_TOOLS = {
    "web_search": "Search the web/marketplaces for a product name; returns titles, URLs, snippets.",
    "scrape_reviews": "Fetch recent reviews of a listing for sentiment and complaints (S4).",
}


def tools_for(agent: str) -> list[dict]:
    return [TOOLS[name].schema() for name in AGENTS[agent].tools]
