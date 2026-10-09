import { expect, test } from "@playwright/test";
import { assetFixture } from "./asset-fixture.js";
import { comparisonFixture } from "./comparison-fixture.js";
import { appDesignFixture } from "./app-design-fixture.js";
import { importReviewFixture } from "./import-review-fixture.js";
import { PAGES } from "./pages.js";
import { CONTRAST_HELPERS } from "./contrast-helper.js";

for (const mode of ["light", "dark"]) {
  test(`accepted R7 identity and secondary button boundaries remain clear: ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
    const state = await assetFixture(page);
    state.user = null;
    await page.goto("/login");
    const logo = page.locator(".auth-logo img");
    await expect(logo).toBeVisible();
    expect((await logo.boundingBox()).width).toBeCloseTo(440, 2);
    const footer = page.locator(".auth-copyright");
    await expect(footer).toContainText("ฝ่ายเทคโนโลยีสารสนเทศ");
    await expect(footer).toContainText("โรงพยาบาลมหาวิทยาลัยเทคโนโลยีสุรนารี");
    const toggle = page.locator(".auth-theme");
    await expect(toggle).toHaveCSS("border-radius", "50%");
    const edge = await toggle.evaluate(el => ({ border: getComputedStyle(el).borderColor, fill: getComputedStyle(el).backgroundColor }));
    const ratio = await page.evaluate(`${CONTRAST_HELPERS} contrast.ratio(contrast.rgba(${JSON.stringify(edge.border)}), contrast.rgba(${JSON.stringify(edge.fill)}));`);
    expect(ratio).toBeGreaterThanOrEqual(3);
    await page.setViewportSize({ width: 1366, height: 768 });
    expect((await logo.boundingBox()).width).toBeCloseTo(440, 2);
    await expect(footer).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    state.user = { id: 1, username: "admin", role: "admin" };
    await page.goto("/dashboard");
    const secondary = page.getByRole("link", { name: "เปรียบเทียบ", exact: true });
    await expect(secondary).toBeVisible();
    for (const hovered of [false, true]) {
      if (hovered) await secondary.hover();
      await expect.poll(async () => {
        const colors = await secondary.evaluate(el => ({ border: getComputedStyle(el).borderColor, fill: getComputedStyle(el).backgroundColor }));
        return page.evaluate(`${CONTRAST_HELPERS} contrast.ratio(contrast.rgba(${JSON.stringify(colors.border)}), contrast.rgba(${JSON.stringify(colors.fill)}));`);
      }).toBeGreaterThanOrEqual(3);
    }
  });
}

test("import create-name fields follow the workspace grid on tablet and desktop", async ({ page }) => {
  for (const mode of ["light", "dark"]) {
    await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
    await importReviewFixture(page);
    await page.goto("/admin/import/41");
    const rename = page.getByRole("textbox", { name: "ชื่อที่จะใช้ในระบบสำหรับ Review building" });
    await expect(rename).toBeVisible();
    for (const width of [720, 980, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await rename.evaluate(el => {
        const grid = el.closest(".workspace-decision-grid");
        const box = el.getBoundingClientRect();
        const select = grid.querySelector("select").getBoundingClientRect();
        return {
          workspace: document.querySelector(".app-workspace").getBoundingClientRect().width,
          columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          sameColumn: Math.abs(box.left - select.left) < 1 && Math.abs(box.width - select.width) < 1,
          contained: box.right <= grid.getBoundingClientRect().right + 1,
        };
      });
      expect(layout.columns).toBe(layout.workspace <= 760 ? 1 : 3);
      expect(layout.sameColumn).toBe(true);
      expect(layout.contained).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("OKLCH tokens preserve approved colors and the ocean scale is monotonic", async ({ page }) => {
  await appDesignFixture(page, { url: "/dashboard" });
  const result = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const probe = document.createElement("span");
    document.body.append(probe);
    const colors = ["warm-50", "peach-100", "mint-100", "blue-100", "ocean-930", "action-700"].map(token => {
      probe.style.color = `var(--${token})`;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = getComputedStyle(probe).color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    });
    probe.remove();
    const style = getComputedStyle(document.documentElement);
    const lightness = [50, 200, 400, 500, 600, 700, 750, 850, 900, 925, 930, 950, 975].map(step =>
      Number(style.getPropertyValue(`--ocean-${step}`).match(/oklch\(\s*([\d.]+)/)?.[1]));
    return { colors, lightness };
  });
  const approved = [[251,247,242], [255,207,168], [174,226,223], [201,228,242], [11,31,36], [14,98,114]];
  result.colors.forEach((color, index) => color.forEach((value, channel) =>
    expect(Math.abs(value - approved[index][channel])).toBeLessThanOrEqual(1)));
  expect(result.lightness.every(Number.isFinite)).toBe(true);
  expect(result.lightness.every((value, index, values) => index === 0 || value < values[index - 1])).toBe(true);
});

test("long monthly point labels stay inside the chart after a narrow resize", async ({ page }) => {
  await appDesignFixture(page, { url: "/dashboard" });
  await page.route(/\/api\/dashboard\/monthly-kpi(?:\?.*)?$/, route => route.fulfill({ json:
    Array.from({ length: 12 }, (_, index) => ({
      month: `${index < 3 ? 2025 : 2026}-${String((index + 9) % 12 + 1).padStart(2, "0")}`,
      total_pages: 12345, total_cost: 12345,
    })),
  }));
  await page.reload();
  await expect(page.getByTestId("stock-chart-point").first()).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  await expect.poll(() => page.getByTestId("stock-chart-point").evaluateAll(nodes => nodes.filter(node => {
    const label = node.getBoundingClientRect();
    const chart = node.closest('[role="figure"]').getBoundingClientRect();
    return label.left < chart.left - 1 || label.right > chart.right + 1;
  }).map(node => node.textContent))).toEqual([]);
  expect(await page.getByTestId("stock-chart-point").count()).toBeGreaterThan(0);
});

test("mobile navigation contains focus, closes with Escape and returns to its opener", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await assetFixture(page, "staff");
  await page.goto("/assets");
  const opener = page.getByRole("button", { name: "เปิดเมนู", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("dialog", { name: "เมนูหลัก", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "บันทึกจำนวนพิมพ์", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: "จัดการผู้ใช้", exact: true })).toHaveCount(0);
  for (let i = 0; i < 24; i++) {
    await page.keyboard.press("Tab");
    expect(await menu.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("workspace uses available width and brand details retain the organization identity", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1080 });
  await assetFixture(page);
  await page.goto("/assets");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
  const widths = await main.evaluate(el => ({ main: el.clientWidth, content: el.firstElementChild.clientWidth }));
  expect(widths.main - widths.content).toBeLessThanOrEqual(64);
  const about = page.getByRole("button", { name: "ข้อมูลระบบ", exact: true });
  await about.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "SUTH Helpdesk Assets", exact: true });
  await expect(dialog).toContainText("โรงพยาบาลมหาวิทยาลัยเทคโนโลยีสุรนารี");
  await expect(dialog).toContainText("ฝ่ายเทคโนโลยีสารสนเทศ");
  await page.keyboard.press("Escape");
  await expect(about).toBeFocused();
});

test("Login stores only the opted-in username, preserves API errors and allows retry", async ({ page }) => {
  const state = await assetFixture(page);
  state.user = null;
  let received;
  await page.route("**/api/auth/login", route => {
    received = route.request().postDataJSON();
    return route.fulfill({ status: 429, json: { status: 429, title: "พยายามเข้าสู่ระบบหลายครั้งเกินไป รอสักครู่แล้วลองอีกครั้ง" } });
  });
  await page.goto("/login");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("  synthetic-user  ");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-secret");
  await page.getByRole("checkbox", { name: "จดจำชื่อผู้ใช้", exact: true }).check();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("รอสักครู่แล้วลองอีกครั้ง");
  expect(received).toEqual({ username: "synthetic-user", password: "synthetic-secret" });
  const stored = await page.evaluate(() => ({ username: localStorage.getItem("suth.login.username"), values: Object.values(localStorage) }));
  expect(stored.username).toBe("synthetic-user");
  expect(stored.values).not.toContain("synthetic-secret");
  await page.reload();
  await expect(page.getByLabel("ชื่อผู้ใช้", { exact: true })).toHaveValue("synthetic-user");
  await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("");
  await page.getByRole("checkbox", { name: "จดจำชื่อผู้ใช้", exact: true }).uncheck();
  expect(await page.evaluate(() => localStorage.getItem("suth.login.username"))).toBeNull();
});

test("Login theme uses the shared preference and an empty form never calls the API", async ({ page }) => {
  const state = await assetFixture(page);
  state.user = null;
  let requests = 0;
  await page.route("**/api/auth/login", route => { requests++; return route.fulfill({ status: 503, json: { title: "ลองใหม่" } }); });
  await page.goto("/login");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.locator("#login-username")).toBeFocused();
  await expect(page.locator("#login-username")).toHaveAttribute("aria-invalid", "true");
  expect(requests).toBe(0);
  const theme = page.getByRole("button", { name: /เปลี่ยนเป็นโหมด/ });
  await theme.click();
  const preference = await page.evaluate(() => localStorage.getItem("suth-ui-mode"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-mode", preference);
});

test("KPI columns respond to the available workspace when navigation collapses", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 800 });
  await comparisonFixture(page);
  await page.goto("/dashboard");
  const cards = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" }).locator(":scope > div");
  await expect(cards).toHaveCount(4);
  const columns = () => cards.evaluateAll(nodes => new Set(nodes.map(el => Math.round(el.getBoundingClientRect().left))).size);
  await expect.poll(columns).toBe(2);
  await page.getByRole("button", { name: "พับเมนู", exact: true }).click();
  await expect.poll(columns).toBe(4);
  await page.getByRole("button", { name: "กางแถบเมนู", exact: true }).click();
  await expect.poll(columns).toBe(2);
});

for (const mode of ["light", "dark"]) {
  test(`primary action text remains readable when hovered: ${mode}`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
    const state = await assetFixture(page);
    state.user = null;
    await page.goto("/login");
    const action = page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true });
    await action.hover();
    await action.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('.auth-submit'));`);
    expect(report.unsupported).toBeUndefined();
    expect(report.ratio).toBeGreaterThanOrEqual(4.5);
  });
  test(`Login reflows with help and API error on a short screen: ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
    const state = await assetFixture(page);
    state.user = null;
    await page.route("**/api/auth/login", route => route.fulfill({ status: 401, json: { title: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" } }));
    await page.goto("/login");
    await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("synthetic");
    await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-only");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByText("ลืมรหัสผ่าน?", { exact: true }).click();
    await expect(page.locator("details")).toHaveAttribute("open", "");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText('main');`);
    expect(report.failures).toEqual([]);
    expect(report.unsupported).toEqual([]);
    await expect(page.getByLabel("รหัสผ่าน", { exact: true })).toHaveValue("synthetic-only");
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true })).toBeInViewport();
  });
  for (const target of PAGES) {
    test(`all routed pages reflow and keep readable data: ${target.name} ${mode}`, async ({ page }, testInfo) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.addInitScript(value => localStorage.setItem("suth-ui-mode", value), mode);
      await page.setViewportSize({ width: 1440, height: 900 });
      await appDesignFixture(page, target);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(main.locator(".skeleton")).toHaveCount(0);
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
      const url = new URL(page.url());
      expect(url.pathname).toBe(target.url.replace(":fixture", "1").replace(":session", "41").split("?")[0]);
      await page.screenshot({ path: testInfo.outputPath(`${mode}-desktop.png`), fullPage: true });
      for (const viewport of [{ width: 320, height: 640 }, { width: 1164, height: 501 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
        const report = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText('#main-content');`);
        expect(report.measured).toBeGreaterThan(0);
        expect(report.failures, JSON.stringify(report.failures)).toEqual([]);
        expect(report.unsupported, JSON.stringify(report.unsupported)).toEqual([]);
      }
      await page.setViewportSize({ width: 320, height: 640 });
      await page.screenshot({ path: testInfo.outputPath(`${mode}-phone.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test("Login remains usable when storage is denied and preserves the requested destination", async ({ page }) => {
  const state = await assetFixture(page, "viewer");
  state.user = null;
  await page.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = () => { throw new DOMException("denied", "SecurityError"); };
  });
  await page.goto("/login?redirect=/assets");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("   ");
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill("synthetic-only");
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page.locator("#login-username")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("viewer");
  await page.getByRole("checkbox", { name: "จดจำชื่อผู้ใช้", exact: true }).check();
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
});

test("mobile navigation announces the destination heading after selecting a page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await assetFixture(page, "viewer");
  await page.goto("/assets");
  await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "เมนูหลัก", exact: true });
  await menu.getByRole("link", { name: "ค่าใช้จ่าย", exact: true }).click();
  await expect(page).toHaveURL(/\/expense$/);
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeFocused();
});

test("forced colors and reduced motion keep navigation usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.setViewportSize({ width: 390, height: 844 });
  await assetFixture(page, "viewer");
  await page.goto("/assets");
  await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "เมนูหลัก", exact: true });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator(".canvas-wash").evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "เปิดเมนู", exact: true })).toBeFocused();
});
