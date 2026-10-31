import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const latest = JSON.parse(
  readFileSync(
    new URL("../../data/fixtures/app/runs/45.json", import.meta.url),
    "utf8",
  ),
);
test("saved scores, history, evidence, and shop transitions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: "Video này đã sẵn sàng?" }),
  ).toBeVisible();
  await expect(page.locator(".overall-number")).toContainText(
    String(latest.result.overall.score).replace(".", ","),
  );
  await expect(
    page.getByText("Shop và SKU là dữ liệu giả lập", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Điểm này đến từ đâu?" }).click();
  await page.getByRole("button", { name: "Phát lại trace" }).click();
  await expect(
    page.getByRole("button", { name: "Dừng phát lại" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Decisions API" }).click();
  await page
    .locator(".question")
    .filter({ hasText: "V01" })
    .locator("summary")
    .first()
    .click();
  await expect(page.locator(".question[open] .probabilities")).toBeVisible();
  await page.getByRole("tab", { name: "AI đã xem gì" }).click();
  await expect(page.locator(".filmstrip img").first()).toBeVisible();
  await page.locator(".transcript button").nth(2).click();
  const media = page.locator(".phone-preview video");
  if (await media.count())
    await expect
      .poll(() =>
        media.evaluate((element: HTMLVideoElement) => element.currentTime),
      )
      .toBeGreaterThan(3);
  await page.getByLabel("Lịch sử kết quả", { exact: true }).selectOption("2");
  await expect(
    page.getByRole("heading", { name: "Chưa có điểm tổng" }),
  ).toBeVisible();
  await page.getByLabel("Chọn shop", { exact: true }).selectOption("SHOP009");
  await expect(
    page.getByText("Video này chưa có kết quả trong db.json.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".overall-number")).toHaveCount(0);
  await page.getByRole("button", { name: "Shop & thị trường" }).click();
  await expect(
    page.getByRole("heading", { name: "Bối cảnh của shop" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  expect(errors).toEqual([]);
});
test("local draft validates and saves without creating a run", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Chuẩn bị video", exact: true })
    .click();
  await page
    .getByLabel("Mô tả video", { exact: true })
    .fill("Bản nháp kiểm tra tương tác");
  await page.getByLabel("Shopee", { exact: true }).check();
  await page.getByRole("button", { name: "Lưu bản nháp local" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu bản nháp");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("preflight:draft:SHOP001-VID01") ?? "{}",
        ).caption,
    ),
  ).toBe("Bản nháp kiểm tra tương tác");
  await expect(page.locator(".overall-number")).toContainText(
    String(latest.result.overall.score).replace(".", ","),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Chuẩn bị video", exact: true })
    .click();
  await expect(page.getByLabel("Mô tả video", { exact: true })).toHaveValue(
    "Bản nháp kiểm tra tương tác",
  );
  await expect(page.getByLabel("Shopee", { exact: true })).toBeChecked();
});
test("mobile layout and missing local video remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/media/**", (route) =>
    route.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.goto("/demo");
  await expect(page.locator(".overall-number")).toBeVisible();
  await expect(page.locator(".phone-preview img")).toBeVisible();
  await expect(page.locator(".phone-preview video")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
test("catalog failure is recoverable and media routes are bounded", async ({
  page,
  request,
}) => {
  await page.route("**/demo/app/catalog.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/demo");
  await expect(
    page.getByRole("button", { name: "Tải lại dữ liệu" }),
  ).toBeVisible();
  await page.unroute("**/demo/app/catalog.json");
  await page.getByRole("button", { name: "Tải lại dữ liệu" }).click();
  await expect(page.locator(".overall-number")).toBeVisible();
  const range = await request.get("/media/vn-beauty-467796.mp4", {
    headers: { Range: "bytes=0-1023" },
  });
  if (range.status() !== 404) {
    expect(range.status()).toBe(206);
    expect((await range.body()).length).toBe(1024);
  }
  expect((await request.get("/demo/not-a-file.json")).status()).toBe(404);
});

test("failed historical run can retry the same run", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.locator(".overall-number")).toBeVisible();
  await page.route("**/demo/app/runs/21.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.getByLabel("Lịch sử kết quả", { exact: true }).selectOption("21");
  await expect(
    page.getByRole("button", { name: "Thử lại", exact: true }),
  ).toBeVisible();
  await page.unroute("**/demo/app/runs/21.json");
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Chưa có điểm tổng" })).toBeVisible();
  await expect(page.getByLabel("Lịch sử kết quả", { exact: true })).toHaveValue(
    "21",
  );
});
test("all saved histories render without errors or stale identity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const catalog = JSON.parse(
    readFileSync(
      new URL("../../data/fixtures/app/catalog.json", import.meta.url),
      "utf8",
    ),
  );
  for (const video of catalog.videos.filter((v: { id: string }) =>
    catalog.runs.some((r: { targetId: string }) => r.targetId === v.id),
  )) {
    await page.goto(`/demo?video=${video.id}`);
    for (const item of catalog.runs.filter(
      (r: { targetId: string }) => r.targetId === video.id,
    )) {
      await page
        .getByLabel("Lịch sử kết quả", { exact: true })
        .selectOption(String(item.id));
      await expect(page.locator(".score-summary")).toContainText(
        `Run #${item.id} · đã lưu`,
      );
      const source = JSON.parse(
        readFileSync(
          new URL(
            `../../data/fixtures/app/runs/${item.id}.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
      if (source.result.overall?.score != null)
        await expect(page.locator(".overall-number")).toContainText(
          String(source.result.overall.score).replace(".", ","),
        );
      else
        await expect(
          page.getByRole("heading", { name: "Chưa có điểm tổng" }),
        ).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test("missing scores never expose zero-valued meters", async ({ page }) => {
  await page.goto("/demo?video=SHOP001-VID01");
  await page.getByLabel("Lịch sử kết quả", { exact: true }).selectOption("18");
  await expect(page.locator(".score-summary")).toContainText(
    "Run #18 · đã lưu",
  );
  const run = JSON.parse(
    readFileSync(
      new URL("../../data/fixtures/app/runs/18.json", import.meta.url),
      "utf8",
    ),
  );
  const available = run.result.scores.filter(
    (g: { name: string; score: number | null }) =>
      ["viral_potential", "conversion_potential", "sku_market"].includes(
        g.name,
      ) && g.score != null,
  );
  await expect(page.locator(".score-groups meter")).toHaveCount(
    available.length,
  );
});
