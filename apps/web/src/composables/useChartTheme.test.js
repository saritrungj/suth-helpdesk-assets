// @vitest-environment jsdom
//
// useChartTheme.test.js — กราฟต้องเคารพ "ลดการเคลื่อนไหว" ของระบบปฏิบัติการ
//
// ## ทำไมเรื่องนี้ต้องมีเทส
//
// ระบบมีกฎ `prefers-reduced-motion` อยู่ใน design/base.css แล้ว ซึ่งทำให้ดูเหมือน
// เรื่องนี้ถูกจัดการครบแล้วเวลาอ่านโค้ด แต่กฎนั้นคุมได้แค่ CSS animation และ
// transition ส่วนกราฟทุกอันวาดบน `<canvas>` แล้วเคลื่อนไหวด้วย JavaScript ของ
// Chart.js เอง — ของที่เคลื่อนไหวเยอะที่สุดบนแดชบอร์ดจึงเป็นของชิ้นเดียวที่กฎนั้น
// คุมไม่ถึง และไม่มีอะไรฟ้องเลยเพราะหน้าจอยังทำงานปกติทุกอย่าง
//
// อีกเหตุผลที่จับไว้: แอนิเมชันทำให้กราฟไม่มีสถานะนิ่งที่แน่นอน เคยเสียเวลาไล่หา
// "บั๊กแกน Y" ที่ไม่มีอยู่จริง เพราะวัดความสูงแท่งตอนแอนิเมชันยังวิ่งอยู่ (วัดได้
// 6px จากความสูงจริง 212px) ปิดแอนิเมชันเมื่อผู้ใช้ขอ = เครื่องมือวัดก็ได้ของนิ่งไปด้วย
//
// รัน: npm test --workspace @suth/web

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

/** ตั้ง matchMedia ปลอมให้ตอบตามค่าที่ต้องการ พร้อมจับ listener ที่ถูกผูกไว้ */
function stubMatchMedia(matches) {
  const listeners = [];
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    addEventListener: (_event, handler) => listeners.push(handler),
    removeEventListener: () => {},
  }));
  return listeners;
}

describe("useChartTheme", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    delete window.matchMedia;
  });

  test("ผู้ใช้ขอให้ลดการเคลื่อนไหว — กราฟต้องปิดแอนิเมชัน", async () => {
    stubMatchMedia(true);

    const { useChartTheme } = await import("./useChartTheme");
    const { baseChartOptions } = useChartTheme();

    expect(baseChartOptions.value.animation).toBe(false);
  });

  test("ไม่ได้ขอ — กราฟเปลี่ยนค่าใน 300 มิลลิวินาที", async () => {
    stubMatchMedia(false);

    const { useChartTheme } = await import("./useChartTheme");
    const { baseChartOptions } = useChartTheme();

    // จังหวะกราฟตามข้อกำหนด #115 โดยยังใช้ easing ของ Chart.js
    expect(baseChartOptions.value.animation).toEqual({ duration: 300 });
  });

  test("เปลี่ยนการตั้งค่าระหว่างเปิดหน้าอยู่ ต้องมีผลโดยไม่ต้องรีเฟรช", async () => {
    const listeners = stubMatchMedia(false);

    const { useChartTheme } = await import("./useChartTheme");
    const { baseChartOptions } = useChartTheme();
    expect(baseChartOptions.value.animation).toEqual({ duration: 300 });

    expect(listeners.length).toBeGreaterThan(0);
    listeners.forEach((handler) => handler({ matches: true }));

    expect(baseChartOptions.value.animation).toBe(false);
  });

  test("สภาพแวดล้อมที่ไม่มี matchMedia ต้องไม่พัง", async () => {
    // jsdom รุ่นเก่าและการ render ฝั่งเซิร์ฟเวอร์ไม่มี matchMedia — ถ้าโมดูลนี้
    // พังตอน import ทุกหน้าที่มีกราฟจะขาวทั้งหน้า ไม่ใช่แค่กราฟหาย
    delete window.matchMedia;

    const { useChartTheme } = await import("./useChartTheme");
    const { baseChartOptions } = useChartTheme();

    expect(baseChartOptions.value.animation).toEqual({ duration: 300 });
  });
});
