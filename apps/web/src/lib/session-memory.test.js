// @vitest-environment jsdom
//
// สถานะหน้าจอที่จำไว้ (ตัวกรอง คำค้น) เป็นของผู้ใช้คนที่ตั้งไว้ — เครื่องที่ใช้ร่วมกัน คนถัดไปต้องไม่ได้
// มุมมองของคนก่อน (#241)

import { beforeEach, describe, expect, test } from "vitest";
import { claimSessionMemory, clearSessionMemory, readSession, writeSession } from "./session-memory";

beforeEach(() => window.sessionStorage.clear());

describe("ความจำของหน้าผูกกับผู้ใช้", () => {
  test("ออกจากระบบล้างทุกอย่างที่จำไว้ แต่ไม่แตะของอื่นในที่เก็บ", () => {
    writeSession("route:PrintTransactions", { q: "QA-UX" });
    window.sessionStorage.setItem("other-app", "keep");

    clearSessionMemory();

    expect(readSession("route:PrintTransactions")).toBeNull();
    expect(window.sessionStorage.getItem("other-app")).toBe("keep");
  });

  test("คนเดิมกลับมา (session หมดอายุแล้วล็อกอินใหม่) ยังได้มุมมองเดิม", () => {
    claimSessionMemory(7);
    writeSession("route:Assets", { q: "ห้องยา" });

    claimSessionMemory(7);

    expect(readSession("route:Assets")).toEqual({ q: "ห้องยา" });
  });

  test("คนละคนล็อกอินในแท็บเดิมโดยคนก่อนไม่ได้กดออก — ไม่ได้มุมมองของคนก่อน", () => {
    claimSessionMemory(7);
    writeSession("route:Assets", { q: "ห้องยา" });

    claimSessionMemory(8);

    expect(readSession("route:Assets")).toBeNull();
    // คนใหม่เริ่มจำของตัวเองได้ทันที
    writeSession("route:Assets", { q: "ICU" });
    claimSessionMemory(8);
    expect(readSession("route:Assets")).toEqual({ q: "ICU" });
  });

  test("ความจำที่ยังไม่มีเจ้าของ (ค้างจากรุ่นก่อน) ถูกล้างเมื่อมีคนล็อกอิน", () => {
    writeSession("route:Assets", { q: "ค้าง" });
    claimSessionMemory(7);
    expect(readSession("route:Assets")).toBeNull();
  });
});
