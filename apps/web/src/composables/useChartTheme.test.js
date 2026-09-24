// @vitest-environment jsdom
//
// useChartTheme.test.js — สีของกราฟมาจาก token ของธีม ไม่ใช่ค่าที่ฝังไว้ในแต่ละกราฟ
//
// กราฟวาดบน <canvas> ซึ่งไม่รู้จัก CSS variable — ถ้าอ่านค่าไม่ถึง กราฟจะเป็นสีเดิมทั้งโหมดสว่างและมืด
// โดยไม่มีอะไรฟ้อง เทสนี้จับทั้งการอ่านค่าจริงและค่าสำรองเมื่อยังไม่มี token
//
// รัน: npm test --workspace @suth/web

import { afterEach, describe, expect, test } from "vitest";
import { useChartTheme } from "./useChartTheme";

describe("useChartTheme", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--chart-1");
    document.documentElement.style.removeProperty("--ink");
  });

  test("อ่านสีจาก CSS variable ของธีม", () => {
    document.documentElement.style.setProperty("--chart-1", "rgb(1, 2, 3)");
    document.documentElement.style.setProperty("--ink", "rgb(4, 5, 6)");
    const { colors } = useChartTheme();
    expect(colors.value.series[0]).toBe("rgb(1, 2, 3)");
    expect(colors.value.ink).toBe("rgb(4, 5, 6)");
  });

  test("ยังไม่มี token ใช้ค่าสำรอง ครบ 8 สี ไม่มีสีซ้ำ", () => {
    const { colors } = useChartTheme();
    expect(colors.value.series).toHaveLength(8);
    expect(new Set(colors.value.series).size).toBe(8);
  });

  test("อ่านจากพื้นผิวของกราฟเองเมื่อส่ง element มา", () => {
    const host = document.createElement("div");
    host.style.setProperty("--chart-1", "rgb(9, 9, 9)");
    document.body.append(host);
    const { colors } = useChartTheme(host);
    expect(colors.value.series[0]).toBe("rgb(9, 9, 9)");
    host.remove();
  });
});
