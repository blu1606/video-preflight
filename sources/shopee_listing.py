"""Shopee product link -> listing: one live fetch, else the listings already crawled into the lab db.

    url -> (shop_id, item_id)   "...-i.<shop>.<item>", "/product/<shop>/<item>", "/<user>/<shop>/<item>";
                                 shortlinks (shp.ee, s.shopee.vn) are followed once, without fetching the page
    live     one GET of Shopee's public product API (short timeout, browser-like headers, never retried)
    crawled  db shopeeListings / marketSnapshots competitors / skus whose URL carries the same ids (or is the
             same URL); fields a crawl marked as mock (`mock_fields`) are dropped, never shown as observed

Only Shopee hosts are ever requested, so a pasted link cannot make the server call anything else.
Every attempt is reported ({method, ok, error}) so the UI can say which source it shows.
"""

import re
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit

import httpx

FETCH_TIMEOUT_S = 6.0
SHOPEE_HOSTS = ("shopee.vn",)
SHORTLINK_HOSTS = ("shp.ee", "s.shopee.vn")
API_URL = "https://shopee.vn/api/v4/pdp/get_pc"
IMAGE_URL = "https://down-vn.img.susercontent.com/file/{}"
PRICE_SCALE = 100_000  # Shopee API prices are VND x 100000
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/129.0 Safari/537.36"),
    "Accept": "application/json",
    "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
}
ID_PATTERNS = (re.compile(r"-i\.(\d+)\.(\d+)"), re.compile(r"/product/(\d+)/(\d+)"),
               re.compile(r"^/[^/]+/(\d+)/(\d+)/?$"))
LISTING_KEYS = ("title", "price_vnd", "list_price_vnd", "rating", "rating_count", "sold", "description", "images",
                "category", "url", "item_id", "shop_id")


class NotShopeeLink(ValueError):
    pass


def _host_in(host: str, hosts: tuple[str, ...]) -> bool:
    return any(host == h or host.endswith("." + h) for h in hosts)


def check_url(url: str) -> str:
    """The URL when it is an http(s) Shopee product or shortlink URL; NotShopeeLink otherwise."""
    url = (url or "").strip()
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise NotShopeeLink("Link phải bắt đầu bằng http:// hoặc https://")
    if not _host_in(parts.hostname.lower(), SHOPEE_HOSTS + SHORTLINK_HOSTS):
        raise NotShopeeLink("Chỉ nhận link sản phẩm Shopee (shopee.vn, shp.ee).")
    return url


def parse_ids(url: str) -> tuple[str, str] | None:
    """(shop_id, item_id) from a Shopee product URL, None when the URL carries no product ids."""
    path = unquote(urlsplit(url).path)
    for pattern in ID_PATTERNS:
        m = pattern.search(path)
        if m:
            return m[1], m[2]
    return None


def is_shortlink(url: str) -> bool:
    return _host_in((urlsplit(url).hostname or "").lower(), SHORTLINK_HOSTS)


def follow_shortlink(url: str, client) -> str:
    """Location of a shortlink redirect (one request, the target page itself is not fetched)."""
    r = client.get(url, headers=HEADERS, timeout=FETCH_TIMEOUT_S, follow_redirects=False)
    location = r.headers.get("location")
    if r.status_code not in (301, 302, 303, 307, 308) or not location:
        raise ValueError(f"shortlink did not redirect (HTTP {r.status_code})")
    target = str(httpx.URL(url).join(location))
    if not _host_in((urlsplit(target).hostname or "").lower(), SHOPEE_HOSTS):
        raise ValueError(f"shortlink points outside Shopee: {urlsplit(target).hostname}")
    return target


def _price(value) -> int | None:
    return round(value / PRICE_SCALE) if isinstance(value, (int, float)) and value > 0 else None


def parse_api_item(data: dict, url: str, shop_id: str, item_id: str) -> dict:
    """Listing from Shopee's product API payload; ValueError when it holds no product."""
    item = ((data or {}).get("data") or {}).get("item") if isinstance(data, dict) else None
    if not isinstance(item, dict) or not item.get("title"):
        code = data.get("error") if isinstance(data, dict) else None
        raise ValueError(f"no product in the API answer (error {code})" if code else "no product in the API answer")
    rating = item.get("item_rating") or {}
    counts = rating.get("rating_count")
    categories = [c.get("display_name") for c in item.get("categories") or [] if isinstance(c, dict)]
    return {
        "title": item["title"],
        "price_vnd": _price(item.get("price_min") or item.get("price")),
        "list_price_vnd": _price(item.get("price_before_discount")),
        "rating": round(rating["rating_star"], 2) if isinstance(rating.get("rating_star"), (int, float)) else None,
        "rating_count": counts[0] if isinstance(counts, list) and counts else None,
        "sold": item.get("historical_sold") if isinstance(item.get("historical_sold"), int) else None,
        "description": item.get("description"),
        "images": [IMAGE_URL.format(h) for h in item.get("images") or [] if isinstance(h, str)],
        "category": " > ".join(c for c in categories if c) or None,
        "url": url, "item_id": item_id, "shop_id": shop_id,
    }


def fetch_live(url: str, shop_id: str, item_id: str, client) -> dict:
    r = client.get(API_URL, params={"item_id": item_id, "shop_id": shop_id}, headers={**HEADERS, "Referer": url},
                   timeout=FETCH_TIMEOUT_S, follow_redirects=False)
    if r.status_code != 200:
        raise ValueError(f"HTTP {r.status_code}")
    return parse_api_item(r.json(), url, shop_id, item_id)


# ---------- crawled fallback ----------

def _sold(display) -> int | None:
    return display if isinstance(display, int) else None


def _from_shopee_listing(row: dict, ids) -> dict:
    """A shopeeListings row (search snippet). Fields listed in `mock_fields` are synthetic: dropped."""
    mock = set(row.get("mock_fields") or [])

    def real(key):
        return None if key in mock else row.get(key)

    return {"title": row.get("sku_title"), "price_vnd": real("price_vnd"), "list_price_vnd": None,
            "rating": real("rating"), "rating_count": real("review_count"), "sold": _sold(real("sold_displayed")),
            "sold_display": real("sold_displayed"), "description": None, "images": [], "category": None,
            "url": row.get("shopee_url"), "item_id": ids and ids[1], "shop_id": ids and ids[0],
            "attributes": real("attributes"), "shop_name": row.get("shop_name"),
            "dropped_mock_fields": sorted(mock)}


def _from_competitor(row: dict, ids) -> dict:
    return {"title": row.get("title"), "price_vnd": row.get("price_vnd"), "list_price_vnd": None,
            "rating": row.get("rating"), "rating_count": row.get("review_count"), "sold": _sold(row.get("sold_count")),
            "sold_display": row.get("sold_display"), "description": None, "images": [], "category": row.get("category_l3"),
            "url": row.get("url"), "item_id": ids and ids[1], "shop_id": ids and ids[0], "shop_name": row.get("shop")}


def _matches(candidate: str | None, url: str, ids) -> bool:
    if not isinstance(candidate, str) or not candidate:
        return False
    if candidate.strip() == url:
        return True
    return ids is not None and parse_ids(candidate) == ids


def find_crawled(url: str, ids, collections: dict) -> tuple[dict, str, str | None] | None:
    """(listing, where, crawled date) from the lab db collections, or None."""
    for row in collections.get("shopeeListings") or []:
        if _matches(row.get("shopee_url"), url, ids) and row.get("source_status") == "REAL":
            return _from_shopee_listing(row, ids), f"shopeeListings/{row.get('id')}", row.get("noted_on")
    for snap in collections.get("marketSnapshots") or []:
        tiktok = snap.get("tiktok") or {}
        for row in (snap.get("competitors") or []) + (tiktok.get("own_listings") or []):
            if _matches(row.get("url"), url, ids):
                when = (row.get("provenance") or {}).get("captured_at") or snap.get("crawled_at")
                return _from_competitor(row, ids), f"marketSnapshots/{snap.get('id')}", when
    for sku in collections.get("skus") or []:
        if sku.get("source_status") == "REAL" and _matches(sku.get("url") or sku.get("shopee_url"), url, ids):
            return ({"title": sku.get("item_name"), "price_vnd": sku.get("price_vnd"),
                     "list_price_vnd": sku.get("original_price_vnd"), "rating": sku.get("rating"),
                     "rating_count": sku.get("rating_count"), "sold": None, "description": None, "images": [],
                     "category": sku.get("category"), "url": sku.get("url") or sku.get("shopee_url"),
                     "item_id": ids and ids[1], "shop_id": ids and ids[0]},
                    f"skus/{sku.get('id')}", sku.get("crawled_at"))
    return None


def _contract(listing: dict) -> dict:
    """Every contract key present (None / [] when the source does not have it), extras kept after them."""
    return {**{k: [] if k == "images" else None for k in LISTING_KEYS}, **listing}


def resolve(url: str, load_collections, client=None) -> dict:
    """{listing, source: live|crawled, fetched_at|crawled_at, attempts, ...}.

    `load_collections()` returns {"shopeeListings": [...], "marketSnapshots": [...], "skus": [...]} (only read
    when the live fetch fails). Raises NotShopeeLink for a non-Shopee URL and LookupError (with the attempts
    as args[1]) when neither source has the product.
    """
    url = check_url(url)
    attempts = []
    own_client = client is None
    client = client or httpx.Client()
    try:
        if is_shortlink(url):
            try:
                url = follow_shortlink(url, client)
                attempts.append({"method": "follow_shortlink", "ok": True, "error": None})
            except (httpx.HTTPError, ValueError) as e:
                attempts.append({"method": "follow_shortlink", "ok": False, "error": f"{type(e).__name__}: {e}"})
        ids = parse_ids(url)
        if ids is None and not is_shortlink(url):
            raise NotShopeeLink("Link không phải trang sản phẩm Shopee (cần dạng ...-i.<shop>.<item>).")
        if ids:
            try:
                listing = fetch_live(url, *ids, client)
                attempts.append({"method": "live_api", "ok": True, "error": None})
                return {"listing": _contract(listing), "source": "live",
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "attempts": attempts}
            except (httpx.HTTPError, ValueError) as e:  # blocked, timeout, captcha page, unexpected payload
                attempts.append({"method": "live_api", "ok": False, "error": f"{type(e).__name__}: {e}"})
    finally:
        if own_client:
            client.close()
    try:
        found = find_crawled(url, ids, load_collections())
        attempts.append({"method": "crawled_db", "ok": found is not None,
                         "error": None if found else "no crawled listing with this item id or URL"})
    except Exception as e:  # the db being down is a failed attempt, not a crash
        found = None
        attempts.append({"method": "crawled_db", "ok": False, "error": f"{type(e).__name__}: {e}"})
    if not found:
        raise LookupError("Không lấy được thông tin sản phẩm từ link này (Shopee chặn và chưa có dữ liệu đã cào). "
                          "Vui lòng nhập tên, giá và mô tả sản phẩm bằng tay.", attempts)
    listing, where, crawled_at = found
    return {"listing": _contract(listing), "source": "crawled", "crawled_at": crawled_at, "crawled_from": where,
            "attempts": attempts}
