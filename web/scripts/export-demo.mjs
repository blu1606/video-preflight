import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bytes = await readFile(path.join(root, "data/db/db.json"));
const db = JSON.parse(bytes);
const destination = path.join(root, "data/fixtures/app");
await mkdir(path.join(destination, "runs"), { recursive: true });
// Machine-specific paths are historical references, not application routes.
function portable(value) {
  if (typeof value === "string")
    return value.replace(
      /[A-Z]:[\\/][^\n"<>]*/g,
      (match) => `[source file: ${match.split(/[\\/]/).at(-1)}]`,
    );
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, portable(item)]),
    );
  return value;
}
const runs = db.analyses.filter((run) =>
  ["video_run", "video_score"].includes(run.kind),
);
for (const run of runs) {
  await writeFile(
    path.join(destination, "runs", `${run.id}.json`),
    JSON.stringify(portable(run)) + "\n",
  );
}
const catalog = {
  provenance: {
    source: "data/db/db.json",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    mode: "saved-snapshot",
  },
  meta: db.meta,
  shops: db.shops,
  skus: db.skus,
  videos: await Promise.all(db.videos.map(async video => {
    const stem = (video.local_file ?? '').replace(/\.[^.]+$/, '')
    let frame_files = []
    if (stem) { try { frame_files = (await readdir(path.join(root, 'data/output/frames', stem))).filter(name => name.endsWith('.jpg')).sort() } catch { /* No extracted frames for this video. */ } }
    return { ...video, frame_files }
  })),
  shopDailyMetrics: db.shopDailyMetrics,
  runs: runs.map(({ id, targetId, createdAt, mode }) => ({
    id,
    targetId,
    createdAt,
    mode,
  })),
};
await writeFile(
  path.join(destination, "catalog.json"),
  JSON.stringify(portable(catalog)) + "\n",
);
console.log(
  `Exported ${catalog.shops.length} shops, ${catalog.videos.length} videos, ${runs.length} saved analyses. No scores recalculated.`,
);
