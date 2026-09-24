import { expect, test } from "@playwright/test";
import { CONTRAST_HELPERS } from "./contrast-helper.js";
import { readFileSync } from "node:fs";

// No server, credentials or database required: actual CSS rendered by Chromium.
test("contrast includes opacity on the text and its ancestor group", async ({ page }) => {
  await page.setContent('<body style="background:white"><div style="opacity:.5"><p id="text" style="color:black;opacity:.4">Important text</p></div></body>');
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  // Black at effective opacity .2 over white is #ccc: approximately 1.6059:1.
  expect(result.ratio).toBeCloseTo(1.6059, 2);
});

test("OKLCH alpha retains the underlying background", async ({ page }) => {
  await page.setContent('<body style="background:white"><p id="text" style="background:oklch(0 0 0 / .5);color:white">Text</p></body>');
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(result.ratio).toBeGreaterThan(3.9);
  expect(result.ratio).toBeLessThan(4.1);
});

test("group opacity applies to its background as well as its text", async ({ page }) => {
  await page.setContent('<body style="background:white"><div style="background:black;opacity:.5"><span id="text" style="color:white">Text</span></div></body>');
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(result.ratio).toBeGreaterThan(3.9);
  expect(result.ratio).toBeLessThan(4.1);
});

test("unsupported gradient is reported instead of counted as measured", async ({ page }) => {
  await page.setContent('<p style="background:linear-gradient(white,black)">Gradient text</p>');
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
  expect(result.measured).toBe(0);
  expect(result.unsupported).toHaveLength(1);
});

test("inactive controls and their labels are excluded, not unrelated text", async ({ page }) => {
  await page.setContent('<button disabled style="opacity:.3"><span>Disabled action</span></button><p style="color:black">Active text</p>');
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
  expect(result.measured).toBe(1);
  expect(result.failures).toEqual([]);
});

for (const mode of ["light", "dark"]) {
  test(`real placeholder styles meet text contrast in ${mode} mode`, async ({ page }) => {
    await page.setContent('<input aria-label="Search" placeholder="Search assets" style="background:var(--surface);font-size:14px">');
    await page.addStyleTag({ content: readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8") });
    await page.addStyleTag({ content: readFileSync(new URL("../src/design/base.css", import.meta.url), "utf8") });
    await page.evaluate((value) => document.documentElement.dataset.mode = value, mode);
    const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
    expect(result.measured).toBe(1);
    expect(result.failures).toEqual([]);
  });
}

test("audit includes placeholders, input values and sidebar text", async ({ page }) => {
  await page.setContent(`<style>body { background:white } input { background:white; color:#ccc } input::placeholder { color:#ccc; opacity:1 }</style>
    <aside><span style="color:#ccc">Sidebar label</span></aside>
    <input aria-label="Search" placeholder="Search assets"><input aria-label="Reading" value="100">`);
  const result = await page.evaluate(`${CONTRAST_HELPERS} contrast.auditText();`);
  expect(result.failures.map((item) => item.kind).sort()).toEqual(["placeholder", "text", "value"]);
});

test("พื้นไล่สีที่ประกาศจุดแย่สุด (.canvas-wash) วัดกับจุดนั้น ไม่ข้ามไป (#204)", async ({ page }) => {
  await page.setContent(`<body style="background:white">
    <div class="canvas-wash" style="--canvas-wash-worst: rgb(128,128,128); background-image: linear-gradient(white, pink)">
      <p id="text" style="color:black">Text</p></div>
    <div style="background-image: linear-gradient(white, pink)"><p id="plain" style="color:black">Plain</p></div></body>`);
  const washed = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#text'));`);
  expect(washed.unsupported).toBeUndefined();
  expect(washed.background).toEqual([128, 128, 128]);
  const plain = await page.evaluate(`${CONTRAST_HELPERS} contrast.measureText(document.querySelector('#plain'));`);
  expect(plain.unsupported).toBeTruthy();
});
