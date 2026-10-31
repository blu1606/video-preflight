"""Run: uv run python -m unittest discover tests (from the repo root)."""

import unittest

from agents.roster import AGENTS, PLANNED_TOOLS, tools_for
from agents.tools import TOOLS, call_tool, percentile


class ToolRegistryTest(unittest.TestCase):
    def test_schemas_are_consistent(self):
        for tool in TOOLS.values():
            params = tool.schema()["function"]["parameters"]
            self.assertTrue(set(tool.required) <= set(params["properties"]), tool.name)
            self.assertIn(tool.effect, {"read", "write", "paid"})

    def test_agents_only_use_registered_tools(self):
        for agent in AGENTS.values():
            self.assertTrue(set(agent.tools) <= set(TOOLS), agent.name)
            self.assertTrue(set(agent.delegates) <= set(AGENTS), agent.name)
            self.assertEqual(len(tools_for(agent.name)), len(agent.tools))
        self.assertFalse(set(PLANNED_TOOLS) & set(TOOLS))

    def test_only_video_analyst_spends_tokens(self):
        paid = {t.name for t in TOOLS.values() if t.effect == "paid"}
        for agent in AGENTS.values():
            if agent.name != "video_analyst":
                self.assertFalse(paid & set(agent.tools), agent.name)

    def test_product_scout_can_scrape_a_product_page(self):
        self.assertIn("scrape_product_page", AGENTS["product_scout"].tools)
        self.assertEqual(TOOLS["scrape_product_page"].effect, "read")
        self.assertNotIn("scrape_product_page", PLANNED_TOOLS)

    def test_call_tool_reports_errors_as_data(self):
        self.assertIn("error", call_tool("nope"))
        self.assertIn("error", call_tool("get_video", {"wrong_arg": 1}))

    def test_percentile(self):
        self.assertEqual(percentile(3, [1, 2, 3, 4]), 0.75)
        self.assertEqual(percentile(1, []), 0.0)


if __name__ == "__main__":
    unittest.main()
