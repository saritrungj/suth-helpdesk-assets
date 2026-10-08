import { expect } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";
import { comparisonFixture } from "./comparison-fixture.js";
import { importSessionFixture } from "./import-session-fixture.js";
import { importReviewFixture } from "./import-review-fixture.js";

// HTTP adapters only: no component/store access, no business database writes.
export async function accessibilityPageFixture(page, target, state, role) {
  let endpoint;
  if (target.fixture === "compare") {
    await comparisonFixture(page, { ...(state === "empty" ? { rows: [] } : {}), role });
    endpoint = /\/api\/dashboard\/monthly-kpi\b/;
  } else if (target.fixture === "import-detail") {
    await importReviewFixture(page);
    endpoint = /\/api\/import-sessions\/41(?:\?.*)?$/;
  } else {
    await assetFixture(page, role);
    if (target.fixture === "import-list") {
      const session = await importSessionFixture(page);
      session.uploaded = state !== "empty";
      endpoint = /\/api\/import-sessions(?:\?.*)?$/;
    } else {
      endpoint = /\/api\/audit-log(?:\?.*)?$/;
      await page.route(endpoint, (route) => route.fulfill({ json: {
        rows: state === "empty" ? [] : [{ id: 282, occurred_at: "2026-10-08T03:00:00.000Z", username: "synthetic-admin", action: "update", entity: "device", entity_id: "1", summary: "SYNTHETIC-282", before: { location: "A" }, after: { location: "B" }, names: {} }],
        total: state === "empty" ? 0 : 1,
      } }));
    }
  }

  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const requests = [];
  await page.route(endpoint, async (route) => {
    requests.push(route.request().url());
    if (state === "loading") await held;
    if (state === "error" || state === "missing") {
      const status = state === "missing" ? 404 : 503;
      return route.fulfill({ status, json: { type: "about:blank", status, title: state === "missing" ? "ไม่พบงานนำเข้า SYNTHETIC-282" : "SYNTHETIC-282 โหลดไม่สำเร็จ" } });
    }
    return route.fallback();
  });

  const url = target.url.replace(":session", "41");
  await page.goto(url);
  await expect(page).toHaveURL(new RegExp(`${url}(?:\\?|$)`));
  await expect(page.getByRole("main")).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const main = page.getByRole("main");
  if (state === "loading") {
    const loadingRegion = target.fixture === "compare" ? main.getByRole("region", { name: "พื้นที่เปรียบเทียบ" }) : main;
    await expect(loadingRegion.locator(".skeleton").first()).toBeVisible();
  }
  else if (state === "error" || state === "missing") {
    const message = target.fixture === "import-list" ? "โหลดรายการงานนำเข้าไม่สำเร็จ" : "SYNTHETIC-282";
    await expect(main.getByRole("alert").filter({ hasText: message }).first()).toBeVisible();
  } else if (target.fixture === "compare") {
    if (state === "empty") await expect(main.getByText("ยังไม่มีการพิมพ์ในขอบเขตที่เลือก", { exact: true }).first()).toBeVisible();
    else await expect(main.getByTestId("compare-chart")).toBeVisible();
  } else if (target.fixture === "import-list") {
    if (state === "empty") await expect(main.getByText("ไม่มีงานที่ค้างอยู่", { exact: true })).toBeVisible();
    else await expect(main.getByTestId("import-session-row")).toContainText("meter-report.xlsx");
  } else if (target.fixture === "import-detail") {
    await expect(main.getByTestId("import-commit")).toBeEnabled();
  } else if (state === "empty") await expect(main.getByRole("cell").getByText("ไม่มีการแก้ไขในช่วงที่เลือก", { exact: true })).toBeVisible();
  else await expect(main.getByRole("row", { name: /SYNTHETIC-282/ })).toBeVisible();
  return { release, requests };
}
