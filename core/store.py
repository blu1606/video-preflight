"""Use json-server as the single DB writer; its middleware snapshots every write."""
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen


class StoreError(RuntimeError):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


class Store:
    def __init__(self, base="http://127.0.0.1:3101"):
        self.base = base

    def request(self, method, path, value=None):
        data = json.dumps(value, ensure_ascii=False).encode() if value is not None else None
        request = Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=10) as response:
                return json.load(response)
        except HTTPError as exc:
            raise StoreError("Không tìm thấy bản ghi" if exc.code == 404 else "DB từ chối thay đổi", exc.code) from exc
        except (URLError, TimeoutError) as exc:
            raise StoreError("Không kết nối được DB. Hãy chạy pnpm lab.") from exc

    def list(self, collection, **query):
        return self.request("GET", f"/{collection}" + ("?" + urlencode(query) if query else ""))

    def get(self, collection, record_id):
        return self.request("GET", f"/{collection}/{quote(record_id, safe='')}")

    def add(self, collection, value):
        return self.request("POST", f"/{collection}", value)

    def patch(self, collection, record_id, value):
        return self.request("PATCH", f"/{collection}/{quote(record_id, safe='')}", value)
