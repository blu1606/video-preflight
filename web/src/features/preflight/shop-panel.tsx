import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Catalog, Shop, Sku } from "./types";
import { money, number, readJson } from "./types";
import { Empty, Source, SourceLink } from "./shared";
interface TikTokMarket {
  source: string;
  provenance?: { captured_at: string; provider: string };
  units_28d?: number;
  video_count?: number;
  own_listings?: {
    title: string;
    price_vnd?: number;
    sold_count?: number;
    url?: string;
  }[];
}
interface Market {
  tiktok?: TikTokMarket;
  sku_id: string;
  keyword: string;
  crawled_at: string;
  competitors: {
    title: string;
    price_vnd: number | null;
    url: string;
    provenance?: { provider: string; captured_at: string };
  }[];
  [key: string]: unknown;
}
export function ShopPanel({
  catalog,
  shop,
  skus,
  skuId,
}: {
  catalog: Catalog;
  shop: Shop;
  skus: Sku[];
  skuId: string;
}) {
  const [market, setMarket] = useState<Market[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    readJson<Market[]>("/demo/market.json", controller.signal)
      .then(setMarket)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const days = catalog.shopDailyMetrics.filter(
    (day) => day.shop_id === shop.id,
  );
  const snapshot = market?.find((item) => item.sku_id === skuId);
  return (
    <div className="shop-panel">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Bối cảnh của shop</h2>
            <p className="muted">
              {shop.shop_name} · kỳ dữ liệu 27/09–26/10/2026
            </p>
          </div>
          <Source />
        </div>
        <div className="shop-metrics">
          <div>
            <span>GMV 30 ngày</span>
            <strong>{money(shop.gmv_30d_vnd)}</strong>
          </div>
          <div>
            <span>Đơn hàng</span>
            <strong>{number(shop.orders_30d)}</strong>
          </div>
          <div>
            <span>Đánh giá shop</span>
            <strong>{shop.shop_rating}/5</strong>
          </div>
        </div>
        <h3>GMV theo ngày · giả lập</h3>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={days}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(8)} />
              <YAxis
                width={68}
                tickFormatter={(v) => `${number(Number(v) / 1000000)}tr`}
              />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="gmv_vnd"
                name="GMV giả lập"
                stroke="var(--brand)"
                fill="var(--brand-soft)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details>
          <summary>Traffic theo nguồn · giả lập</summary>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => String(v).slice(8)}
                />
                <YAxis />
                <Tooltip />
                <Bar
                  isAnimationActive={false}
                  dataKey="visits_organic"
                  name="Organic"
                  stackId="traffic"
                  fill="var(--brand)"
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="visits_video"
                  name="Video"
                  stackId="traffic"
                  fill="var(--chart-2)"
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="visits_ads"
                  name="Ads"
                  stackId="traffic"
                  fill="var(--chart-3)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </details>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Giá</th>
                <th>Tồn kho</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((sku) => (
                <tr key={sku.id}>
                  <td>
                    {sku.item_name}
                    <small>{sku.id} · MOCK</small>
                  </td>
                  <td>{money(sku.price_vnd)}</td>
                  <td>{sku.stock}</td>
                  <td>{sku.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel">
        <h2>Đối chiếu thị trường</h2>
        <p className="muted">
          Snapshot theo SKU đã chọn. Không phải giá cập nhật trực tiếp.
        </p>
        {error ? (
          <p role="alert">{error}</p>
        ) : !market ? (
          <p role="status">Đang đọc snapshot thị trường…</p>
        ) : !snapshot ? (
          <Empty>Chưa có snapshot cho SKU này.</Empty>
        ) : (
          <>
            <Source>CRAWLED · {snapshot.crawled_at}</Source>
            <h3>{snapshot.keyword}</h3>
            {snapshot.tiktok && (
              <div className="market-chart">
                <h3>TikTok Shop · số bán 28 ngày</h3>
                <p className="small muted">
                  {snapshot.tiktok.provenance?.provider ??
                    snapshot.tiktok.source}{" "}
                  ·{" "}
                  {snapshot.tiktok.provenance?.captured_at ??
                    snapshot.crawled_at}
                </p>
                {snapshot.tiktok.own_listings?.length ? (
                  <>
                    <div className="chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={snapshot.tiktok.own_listings
                            .slice(0, 6)
                            .map((item, index) => ({
                              ...item,
                              name: `SP ${index + 1}`,
                            }))}
                        >
                          <CartesianGrid
                            vertical={false}
                            stroke="var(--border)"
                          />
                          <XAxis dataKey="name" />
                          <YAxis
                            width={64}
                            tickFormatter={(value) => number(Number(value))}
                          />
                          <Tooltip
                            formatter={(value) => number(Number(value))}
                          />
                          <Bar
                  isAnimationActive={false}
                            dataKey="sold_count"
                            name="Số bán 28 ngày (crawled)"
                            fill="var(--brand)"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <details>
                      <summary>Sản phẩm trong biểu đồ & nguồn</summary>
                      {snapshot.tiktok.own_listings
                        .slice(0, 6)
                        .map((item, index) => (
                          <p key={index}>
                            <SourceLink url={item.url}>
                              SP {index + 1} · {item.title}
                            </SourceLink>
                          </p>
                        ))}
                    </details>
                  </>
                ) : (
                  <Empty>Chưa có số bán theo sản phẩm để vẽ biểu đồ.</Empty>
                )}
              </div>
            )}
            <h3>Giá niêm yết đối chiếu</h3>
            {snapshot.competitors.slice(0, 8).map((item, index) => (
              <article className="competitor" key={index}>
                <SourceLink url={item.url}>{item.title}</SourceLink>
                <strong>
                  {item.price_vnd == null
                    ? "Chưa có giá"
                    : money(item.price_vnd)}
                </strong>
                <small>
                  {item.provenance?.provider ?? "Nguồn theo snapshot"} ·{" "}
                  {item.provenance?.captured_at ?? snapshot.crawled_at}
                </small>
              </article>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
