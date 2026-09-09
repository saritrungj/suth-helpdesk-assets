// apps/web/src/app/navigation.test.js
//
// เทสของการหา "หน้าปัจจุบัน" จากโครงสร้างเมนู
//
// ทำไมต้องมี: ตรรกะนี้ตัดสินสามอย่างพร้อมกัน — รายการไหนในแถบเมนูสว่าง,
// breadcrumb เขียนว่าอะไร, และ document.title เป็นอะไร ถ้ามันคืน null ผลที่
// ได้ไม่ใช่ error แต่เป็นหน้าที่ "ดูปกติแต่ผิด" (แถบเมนูดับทั้งแถบ, breadcrumb
// ขึ้นชื่อระบบซ้ำสองครั้ง) ซึ่งไม่มีอะไรจับได้นอกจากคนสังเกตเห็นเอง
//
// เคสที่พังมาแล้วจริงตอนเขียน และเป็นเหตุผลที่ไฟล์นี้มีอยู่
//   - หน้าลูกอย่าง /assets/17 ไม่ตรงกับรายการเมนูไหนเลย
//   - isActiveNav เทียบวัตถุด้วย === ทั้งที่ ALL_NAV_ITEMS เก็บ "สำเนา"
//     ของรายการ ไม่ใช่ตัวเดียวกับที่แถบเมนูวนอยู่ จึงเป็นเท็จเสมอ

import { describe, expect, it } from "vitest";

import {
  ADMIN_GROUPS,
  NAV_GROUPS,
  findActiveGroup,
  findActiveItem,
  isActiveNav,
  matchesRoute,
} from "./navigation";

/** สร้าง route จำลองแบบที่ vue-router ส่งให้ (ต้องมี path และ query เสมอ) */
function routeAt(path, query = {}) {
  return { path, query };
}

/** หยิบรายการเมนูต้นฉบับตาม path — ต้นฉบับ ไม่ใช่สำเนาใน ALL_NAV_ITEMS */
function navItem(path) {
  for (const group of NAV_GROUPS) {
    const found = group.items.find((item) => item.to === path);
    if (found) return found;
  }
  throw new Error(`ไม่มีรายการเมนู ${path}`);
}

describe("findActiveItem", () => {
  it("หาหน้าที่ตรงกับ path ตรงๆ ได้", () => {
    expect(findActiveItem(routeAt("/assets"))?.label).toBe("ทะเบียนทรัพย์สิน");
  });

  it("?fy= ที่ระบบเติมให้ทุกหน้าต้องไม่ทำให้หาไม่เจอ", () => {
    expect(findActiveItem(routeAt("/dashboard", { fy: "1" }))?.label).toBe("แดชบอร์ด");
  });

  it("หน้าลูกตกกลับไปหาหน้าแม่ — /assets/17 คือทะเบียนทรัพย์สิน", () => {
    expect(findActiveItem(routeAt("/assets/17"))?.label).toBe("ทะเบียนทรัพย์สิน");
  });

  it("เส้นทางที่ไม่รู้จักคืน null ไม่ใช่เดามั่ว", () => {
    expect(findActiveItem(routeAt("/ไม่มีหน้านี้"))).toBeNull();
  });

  it("ห้ามจับคู่ด้วยคำนำหน้าที่ไม่ได้อยู่คนละขั้นของ path", () => {
    // "/assets-archive" ขึ้นต้นด้วย "/assets" แต่ไม่ใช่หน้าลูกของมัน
    // ถ้าเทียบด้วย startsWith เฉยๆ โดยไม่มี "/" ต่อท้าย จะจับผิดเคสนี้
    expect(findActiveItem(routeAt("/assets-archive"))).toBeNull();
  });
});

describe("navigation groups", () => {
  it("ใช้สี่หมวดตามภาษาของงาน", () => {
    expect([...NAV_GROUPS, ...ADMIN_GROUPS].map((group) => group.label)).toEqual([
      "ภาพรวม",
      "งานประจำ",
      "รายงาน",
      "ตั้งค่าระบบ",
    ]);
  });

  it("หน้าลูกและ direct link ชี้หมวดที่ sidebar ต้องกาง", () => {
    expect(findActiveGroup(routeAt("/assets/17"))?.key).toBe("routine");
    expect(findActiveGroup(routeAt("/admin/contracts"))?.key).toBe("settings");
    expect(findActiveGroup(routeAt("/admin/add-asset"))?.key).toBe("settings");
  });
});

describe("isActiveNav", () => {
  it("รายการเมนูของหน้าแม่ยังสว่างอยู่เมื่อเปิดหน้าลูก", () => {
    // นี่คือบั๊กที่เคยเกิดจริง: เทียบด้วย === กับสำเนาแล้วเป็นเท็จเสมอ
    expect(isActiveNav(navItem("/assets"), routeAt("/assets/17"))).toBe(true);
  });

  it("รายการอื่นต้องไม่สว่างตามไปด้วย", () => {
    expect(isActiveNav(navItem("/dashboard"), routeAt("/assets/17"))).toBe(false);
    expect(isActiveNav(navItem("/print-transactions"), routeAt("/assets/17"))).toBe(false);
  });

  it("ตรงกันแบบเป๊ะก็ยังสว่างเหมือนเดิม", () => {
    expect(isActiveNav(navItem("/assets"), routeAt("/assets"))).toBe(true);
  });
});

describe("matchesRoute", () => {
  it("เทียบเฉพาะ query key ที่รายการนั้นระบุไว้", () => {
    const item = { to: { path: "/expense", query: { tab: "department" } } };

    expect(matchesRoute(item, routeAt("/expense", { tab: "department", fy: "2" }))).toBe(true);
    expect(matchesRoute(item, routeAt("/expense", { tab: "expense" }))).toBe(false);
    expect(matchesRoute(item, routeAt("/expense", {}))).toBe(false);
  });
});
