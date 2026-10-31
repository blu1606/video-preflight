import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const root = fileURLToPath(new URL("../../data/", import.meta.url));
export function demoAssets(): Plugin {
  const files = new Map<string, string>();
  const register = (folder: string, prefix: string, extensions: string[]) => {
    const base = path.join(root, folder);
    if (!existsSync(base)) return;
    for (const entry of readdirSync(base, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile() || !extensions.includes(path.extname(entry.name)))
        continue;
      const absolute = path.join(entry.parentPath, entry.name);
      files.set(
        `/demo/${prefix}/${path.relative(base, absolute).replaceAll("\\", "/")}`,
        absolute,
      );
    }
  };
  register("fixtures/app", "app", [".json"]);
  register("assets/skus", "skus", [".jpg"]);
  register("output/frames", "frames", [".jpg"]);
  register("output/features", "features", [".json"]);
  register("output/music", "music", [".json"]);
  files.set(
    "/demo/market.json",
    path.join(root, "fixtures/market/market_snapshots.json"),
  );
  // Media is local-only. Exact filenames are allowlisted; arbitrary paths never resolve.
  const videos = new Map<string, string>();
  if (existsSync(path.join(root, "videos"))) {
    for (const name of readdirSync(path.join(root, "videos"))) {
      if (/\.(mp4|webm|mov|mkv)$/i.test(name))
        videos.set(`/media/${name}`, path.join(root, "videos", name));
    }
  }
  return {
    name: "demo-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const file = files.get(url) ?? videos.get(url);
        if (!file) {
          if (url.startsWith("/demo/") || url.startsWith("/media/")) {
            res.statusCode = 404;
            res.end("Asset unavailable");
            return;
          }
          next();
          return;
        }
        if (!["GET", "HEAD"].includes(req.method ?? "")) {
          res.statusCode = 405;
          res.end();
          return;
        }
        const size = statSync(file).size;
        const ext = path.extname(file);
        res.setHeader(
          "Content-Type",
          (
            {
              ".json": "application/json; charset=utf-8",
              ".jpg": "image/jpeg",
              ".mp4": "video/mp4",
              ".webm": "video/webm",
              ".mov": "video/quicktime",
            } as Record<string, string>
          )[ext] ?? "application/octet-stream",
        );
        res.setHeader("Accept-Ranges", "bytes");
        let start = 0;
        let end = size - 1;
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (match && (match[1] || match[2])) {
            start = match[1]
              ? Number(match[1])
              : Math.max(0, size - Number(match[2]));
            end =
              match[1] && match[2]
                ? Math.min(size - 1, Number(match[2]))
                : size - 1;
          } else start = size;
          if (start >= size || start > end) {
            res.statusCode = 416;
            res.setHeader("Content-Range", `bytes */${size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
        }
        res.setHeader("Content-Length", end - start + 1);
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        const stream = createReadStream(file, { start, end });
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      });
    },
    generateBundle() {
      for (const [url, file] of files)
        this.emitFile({
          type: "asset",
          fileName: url.slice(1),
          source: readFileSync(file),
        });
    },
  };
}
