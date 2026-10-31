import type { ReactNode } from "react";
import { Database, ExternalLink, Info } from "lucide-react";
import type { Json } from "./types";
export function Source({
  children = "MOCK · dữ liệu thử nghiệm",
}: {
  children?: ReactNode;
}) {
  return (
    <span className="source">
      <Database size={12} />
      {children}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Info size={24} />
      <p>{children}</p>
    </div>
  );
}
export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="json-view">{JSON.stringify(value ?? null, null, 2)}</pre>
  );
}
export function SourceLink({
  url,
  children,
}: {
  url?: string;
  children: ReactNode;
}) {
  return url && /^https?:\/\//.test(url) ? (
    <a className="text-link" href={url} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={13} />
    </a>
  ) : (
    <span>{children}</span>
  );
}
export function Value({ value }: { value: Json | undefined }) {
  return (
    <span>
      {value == null
        ? "Chưa có dữ liệu"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value)}
    </span>
  );
}
