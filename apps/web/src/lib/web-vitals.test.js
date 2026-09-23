import { afterEach, describe, expect, test, vi } from "vitest";
import { createReporter, routePattern, startWebVitals, toReport } from "./web-vitals.js";

describe("toReport — แปลงค่าจาก web-vitals เป็นรูปแบบที่ API รับ", () => {
  test("LCP ส่ง element ที่เป็นเนื้อหาหลัก และปัดค่า", () => {
    const report = toReport(
      { name: "LCP", value: 1234.567, rating: "good", id: "v5-1", navigationType: "navigate", attribution: { target: "main>h1" } },
      "/dashboard"
    );
    expect(report).toEqual({ name: "LCP", value: 1234.6, rating: "good", id: "v5-1", navigationType: "navigate", page: "/dashboard", target: "main>h1" });
  });

  test("INP ส่ง element ที่กด ชนิดการกด และเวลาแต่ละช่วง — บอกได้ว่าช้าที่โค้ดหรือที่การวาด", () => {
    const report = toReport(
      {
        name: "INP", value: 312, rating: "poor", id: "v5-2",
        attribution: { interactionTarget: "button.save", interactionType: "pointer", inputDelay: 10.04, processingDuration: 250.46, presentationDelay: 51.5 },
      },
      "/assets/:id"
    );
    expect(report).toMatchObject({ target: "button.save", interactionType: "pointer", inputDelay: 10, processingDuration: 250.5, presentationDelay: 51.5 });
  });

  test("CLS ใช้ element ที่ขยับมากสุด และเก็บทศนิยมพอสำหรับเกณฑ์ 0.1", () => {
    const report = toReport({ name: "CLS", value: 0.123456, rating: "needs-improvement", id: "v5-3", attribution: { largestShiftTarget: "#main-content>div" } }, "/report");
    expect(report.value).toBe(0.1235);
    expect(report.target).toBe("#main-content>div");
  });

  test("ตัดอักขระควบคุมและความยาว — API ปฏิเสธทั้งชุดถ้าหลุดไป", () => {
    const report = toReport({ name: "LCP", value: 1, rating: "good", id: "v5-4", attribution: { target: `a\nb${"x".repeat(300)}` } }, "/");
    expect(report.target).not.toMatch(/\n/);
    expect(report.target.length).toBe(200);
  });

  test("ไม่ใส่ฟิลด์ที่ไม่มีค่า", () => {
    expect(toReport({ name: "TTFB", value: 5, rating: "good", id: "v5-5" }, "/login")).toEqual({ name: "TTFB", value: 5, rating: "good", id: "v5-5", page: "/login" });
  });
});

describe("routePattern — ส่งรูปแบบ route ไม่ใช่ URL จริง", () => {
  test("ใช้ path ของ route ที่ match (มี :id) และไม่มี query", () => {
    expect(routePattern({ path: "/assets/42", matched: [{ path: "/assets/:id" }] })).toBe("/assets/:id");
    expect(routePattern({ path: "/dashboard?fy=1", matched: [] })).toBe("/dashboard");
    expect(routePattern(undefined)).toBe("/");
  });
});

describe("createReporter — รวมชุดแล้วส่งครั้งเดียว", () => {
  test("id เดียวกันเก็บค่าล่าสุด (INP แบบ reportAllChanges) และ flush แล้วว่าง", () => {
    const send = vi.fn();
    const reporter = createReporter(send);
    reporter.add({ id: "a", value: 100 });
    reporter.add({ id: "a", value: 300 });
    reporter.add({ id: "b", value: 1 });
    reporter.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([{ id: "a", value: 300 }, { id: "b", value: 1 }]);
    expect(reporter.size).toBe(0);
    reporter.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("แบ่งชุดละไม่เกิน 20 ค่า ตามที่ API รับ", () => {
    const send = vi.fn();
    const reporter = createReporter(send);
    for (let i = 0; i < 45; i++) reporter.add({ id: `m${i}` });
    reporter.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([20, 20, 5]);
  });
});

describe("startWebVitals", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("ไม่ทำอะไรในเบราว์เซอร์อัตโนมัติ (navigator.webdriver) — เทสและ bot ต้องไม่ปนค่าของคนจริง", () => {
    const sendBeacon = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal("navigator", { webdriver: true, sendBeacon });
    vi.stubGlobal("document", { addEventListener });
    startWebVitals({ currentRoute: { value: { path: "/" } } }, "http://api/api");
    expect(addEventListener).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
