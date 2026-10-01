import { expect, test } from "@playwright/test";
import { COMPARISON_ROWS, comparisonFixture } from "./comparison-fixture.js";

/*
 * ตัวเลขในการ์ดสรุป (UiStat) ห้ามถูกตัดบนมือถือ (#213)
 *
 * #213 แก้ไว้แล้วด้วยขนาดตัวอักษรตามความกว้างการ์ด (cqi) แต่ยังไม่มีเทสที่จอแคบ
 * เทสนี้ใช้ยอดที่ยาวที่สุดที่เป็นไปได้จริง (ค่าพิมพ์หลักสิบล้านบาท ยอดพิมพ์หลักล้านหน้า)
 * แล้ววัดว่าตัวเลขทุกใบอยู่ในกรอบการ์ดครบ และหน้าไม่เลื่อนแนวนอน
 */
const HUGE_ROWS = COMPARISON_ROWS.map((row) => {
  const pages = row.pages_printed * 9973;
  const net = Math.round(pages * 98) / 100;
  const price = Number(row.price_per_page);
  return { ...row, pages_printed: pages, net_pages: net.toFixed(2), total_cost: (Math.round(net * price * 100) / 100).toFixed(2) };
});

for (const width of [320, 375, 414]) {
  test(`ตัวเลขการ์ดสรุปไม่ถูกตัดที่ความกว้าง ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await comparisonFixture(page, { rows: HUGE_ROWS });
    await page.goto("/dashboard");

    const kpi = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" });
    await expect(kpi.locator(":scope > div")).toHaveCount(4);
    await expect(kpi).toContainText("ค่าพิมพ์รวม");
    await expect(kpi.getByText(/^\d{1,3}(,\d{3}){2,}/).first()).toBeVisible();

    const cards = await kpi.locator(":scope > div").evaluateAll((nodes) =>
      nodes.map((card) => {
        const box = card.getBoundingClientRect();
        const inside = (el) => {
          const r = el.getBoundingClientRect();
          return r.right <= box.right + 1 && r.left >= box.left - 1 && el.scrollWidth <= el.clientWidth + 1;
        };
        const value = card.querySelector("p.flex > span");
        const hint = card.querySelector("p.text-xs.leading-snug");
        return { text: value.textContent.trim(), valueOk: inside(value), hint: hint?.textContent.trim() ?? "", hintOk: hint ? inside(hint) : true };
      }),
    );
    for (const card of cards) {
      expect(card.valueOk, `ตัวเลข "${card.text}" ถูกตัดหรือล้นการ์ด`).toBe(true);
      expect(card.hintOk, `คำอธิบาย "${card.hint}" ถูกตัดหรือล้นการ์ด`).toBe(true);
    }

    const pageScroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(pageScroll, "หน้าเลื่อนแนวนอนได้").toBeLessThanOrEqual(0);
  });
}

// จำนวนคอลัมน์ของการ์ด: 1 ต่ำกว่า 360px, 2 ตั้งแต่ 360px, 4 ที่จอกว้าง (xl) — กันจุดเปลี่ยนเลื่อนโดยไม่ตั้งใจ
for (const [width, columns] of [[359, 1], [360, 2], [1280, 4]]) {
  test(`การ์ดสรุปเรียง ${columns} คอลัมน์ที่ความกว้าง ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await comparisonFixture(page, { rows: HUGE_ROWS });
    await page.goto("/dashboard");

    const cards = page.getByRole("region", { name: "สรุปตัวเลขสำคัญ" }).locator(":scope > div");
    await expect(cards).toHaveCount(4);
    const xs = await cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(columns);
  });
}
