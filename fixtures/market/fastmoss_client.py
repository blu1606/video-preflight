"""Minimal FastMoss MCP client (streamable HTTP, JSON-RPC). The key is read from an env file, never printed,
and any response that reflects it is refused. Every call is appended to raw/fastmoss/ledger.jsonl.

FastMoss terms (section 3) restrict bulk download, third-party transfer and public display without written
consent: keep raw/ private (git-ignored) and query only the SKUs being analysed.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

URL = "https://mcp.fastmoss.com/mcp"
RAW = Path(__file__).resolve().parent / "raw" / "fastmoss"


class FastMoss:
    def __init__(self, env_file: str):
        self.key = (dotenv_values(env_file).get("FASTMOSS_API_KEY") or "").strip()
        if not self.key:
            raise SystemExit("FASTMOSS_API_KEY missing")
        self.session = None
        self.protocol = "2025-03-26"
        self.seq = 0
        RAW.mkdir(parents=True, exist_ok=True)
        init = self._rpc("initialize", {"protocolVersion": self.protocol, "capabilities": {},
                                        "clientInfo": {"name": "video-intel-lab", "version": "1.0"}})
        self.protocol = init["protocolVersion"]
        self._rpc("notifications/initialized", {}, notification=True)

    def _rpc(self, method: str, params: dict, notification: bool = False):
        self.seq += 1
        body = {"jsonrpc": "2.0", "method": method, "params": params, **({} if notification else {"id": self.seq})}
        headers = {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream"}
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        if method != "initialize":
            headers["MCP-Protocol-Version"] = self.protocol
        r = httpx.post(URL, json=body, headers=headers, timeout=60)
        self.session = r.headers.get("mcp-session-id") or self.session
        if self.key in r.text:
            raise RuntimeError("credential reflected in response; not saved")
        with (RAW / "ledger.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "method": method,
                                "tool": params.get("name"), "status": r.status_code}) + "\n")
        r.raise_for_status()
        if notification or not r.content:
            return None
        if "text/event-stream" in r.headers.get("content-type", ""):
            msgs = [json.loads("\n".join(l[5:].lstrip() for l in block.splitlines() if l.startswith("data:")))
                    for block in r.text.split("\n\n") if "data:" in block]
        else:
            msgs = [r.json()]
        msg = next(m for m in msgs if m.get("id") == self.seq)
        if "error" in msg:
            raise RuntimeError(f"json-rpc error: {msg['error'].get('message')}")
        return msg["result"]

    def call(self, tool: str, arguments: dict) -> dict:
        """Tool result as parsed JSON (FastMoss returns one JSON text block)."""
        result = self._rpc("tools/call", {"name": tool, "arguments": arguments})
        text = "".join(c.get("text", "") for c in result.get("content", []) if c.get("type") == "text")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = {"text": text}
        return {"is_error": result.get("isError", False), "data": data}

    def credits(self) -> int | None:
        data = self.call("credit_usage_summary", {})["data"]
        return (data.get("balance") or {}).get("available_credits") if isinstance(data, dict) else None
