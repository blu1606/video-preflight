export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Shop {
  id: string;
  shop_name: string;
  main_category: string;
  shop_rating: number;
  orders_30d: number;
  gmv_30d_vnd: number;
  shop_visits_30d: number;
  scenario: string;
}
export interface Sku {
  id: string;
  shopId: string;
  item_name: string;
  price_vnd: number;
  stock: number;
  rating: number;
}
export interface Video {
  id: string;
  shopId: string;
  sku_id: string;
  local_file?: string;
  frame_files?: string[];
  product_label?: string;
  duration_sec: number;
  source_status: string;
  post?: { caption?: string; hashtags?: string[] };
}
export interface Catalog {
  meta: { warning: string };
  provenance: { source: string; sha256: string };
  shops: Shop[];
  skus: Sku[];
  videos: Video[];
  shopDailyMetrics: {
    shop_id: string;
    date: string;
    gmv_vnd: number;
    paid_orders: number;
    visits_ads: number;
    visits_video: number;
    visits_organic: number;
  }[];
  runs: { id: number; targetId: string; createdAt: string; mode: string }[];
}
export interface Feature {
  status: string;
  value: Json;
  source: string;
  evidence?: string[];
  reason?: string;
}
export interface Criterion {
  id: string;
  name: string;
  score: number | null;
  reason?: string;
  inputs: string[];
  weight: number;
}
export interface Score {
  name: string;
  score: number | null;
  coverage: number;
  mock_dependency: boolean;
  criteria: Criterion[];
}
export interface Trace {
  name: string;
  agent: string;
  tool?: string;
  status: string;
  started_ms: number;
  duration_s: number;
  input?: Json;
  output?: Json;
  tokens?: Json;
}
export interface Question {
  id: string;
  group?: string;
  domain: string;
  instructions?: string;
  dimension: string;
  status: string;
  value: Json;
  inputs: string[];
  reason?: string;
  levels?: { label: string; description: string }[] | null;
  answer?: {
    confidence?: number;
    probabilities?: {
      label?: string;
      value?: string | number;
      probability: number;
    }[];
  };
}
export interface Finding {
  rule_id: string;
  outcome: string;
  summary: string;
  evidence: string[];
  source_url?: string;
}
export interface Fix {
  id: string;
  title: string;
  action: string;
  why: string;
  in_caption?: boolean;
  timestamps?: { start: number; label: string; text: string }[];
  refs?: string[];
}
export interface Marker {
  id: string;
  t_start: number;
  t_end?: number;
  title: string;
  comment: string;
  kind: string;
  precise?: boolean;
  time_label?: string;
  lane: string;
}
export interface Run {
  id: number;
  createdAt?: string;
  targetId: string;
  result: {
    overall?: {
      score: number | null;
      label_vi: string;
      coverage: number;
      warnings: string[];
      weights: Record<string, number>;
    };
    scores: Score[];
    fixes?: Fix[];
    markers?: Marker[];
    trace?: Trace[];
    features: Record<string, Feature>;
    policy?: {
      targets: Record<string, { verdict: string; findings: Finding[] }>;
    };
    platform_fit?: {
      targets: Record<
        string,
        {
          checks: {
            id: string;
            label: string;
            status: string;
            note: string;
            spec: string;
            sources?: ({ url?: string; title?: string } | string)[];
          }[];
        }
      >;
    };
    decisions?: { questions: Question[]; calls?: Json[] };
    cross_check?: Json;
    quality_gate?: Json;
    insights?: {
      headline?: string;
      summary?: string;
      shop?: string;
      insights?: { text: string; t?: number; cites?: Json }[];
    };
    benchmark?: Json;
  };
}
export interface Extraction {
  frame_files: string[];
  transcript_segments: { start: number; end: number; text: string }[];
  transcript: string;
  vision_model: string;
  token_usage: Json;
  benchmark_latency: Json;
  features: Json;
}
export const groupNames: Record<string, string> = {
  viral_potential: "Viral",
  conversion_potential: "Conversion",
  sku_market: "SKU & thị trường",
  shop_health: "Shop health",
  policy_compliance: "Policy",
  post_publish_performance: "Hiệu suất thực",
};
export const platforms: Record<string, string> = {
  tiktok_shop_video: "TikTok Shop",
  tiktok_ads: "TikTok Ads",
  shopee_listing: "Shopee",
  meta_ads: "Meta Ads",
};
export const verdictNames: Record<string, string> = {
  needs_review: "Cần xem lại",
  no_issue_detected: "Không phát hiện vi phạm",
  unknown: "Chưa đủ dữ liệu",
  not_triggered: "Không phát hiện vi phạm",
  pass: "Đạt thông số",
  fail: "Không đạt thông số",
  unverified: "Chưa xác minh",
  not_measured: "Chưa đo",
  recommend: "Nên sửa",
};
export const number = (value: number | null | undefined) =>
  value == null
    ? "–"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
        value,
      );
export const money = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
export const time = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(value % 60)
    .toString()
    .padStart(2, "0")}`;
export async function readJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(
      `Không đọc được dữ liệu (${response.status}). Thử tải lại.`,
    );
  return response.json();
}
