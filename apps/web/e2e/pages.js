// apps/web/e2e/pages.js
//
// รายการหน้าหลังล็อกอิน — source of truth เดียวที่ใช้ร่วมกันหลายชุดเทส
// (wcag.spec.js, axe-pages.spec.js, ...)
//
// ตั้งใจแยกออกมาจากไฟล์ .spec.js — import ค่าคงที่จากไฟล์ .spec.js ตรงๆ จะลาก
// `test()` ทุกตัวในไฟล์นั้นติดมาโดยไม่ตั้งใจ เพราะ Playwright ลงทะเบียนเทสตอน
// โมดูลถูก import (module side effect) ไม่ใช่ตอนไฟล์นั้นถูกเลือกให้รันจริง —
// axe-pages.spec.js เคย import PAGES จาก wcag.spec.js ตรงๆ แล้วทำให้เทสทั้งหมด
// ของ wcag.spec.js (140 เคส) รันแถมมาโดยไม่มีใครสั่ง จึงย้ายมาไว้ที่นี่แทน

/** ทุกหน้าหลังล็อกอิน — fixture targets ระบุ roles/states ที่สแกนจริง */
export const PAGES = [
  { name: "แดชบอร์ด", url: "/dashboard" },
  { name: "บันทึกจำนวนพิมพ์", url: "/print-transactions" },
  { name: "ทะเบียนเครื่องพิมพ์", url: "/assets" },
  { name: "รายละเอียดเครื่อง", url: "/assets/:fixture" },
  { name: "ค่าใช้จ่าย", url: "/expense" },
  { name: "รายงานสรุป", url: "/report" },
  { name: "สัญญา", url: "/admin/contracts" },
  { name: "จัดการผู้ใช้งาน", url: "/admin/users" },
  { name: "ยี่ห้อ", url: "/admin/brands" },
  { name: "อาคาร", url: "/admin/buildings" },
  { name: "ชั้น", url: "/admin/floors" },
  { name: "ฝ่าย", url: "/admin/divisions" },
  { name: "แผนก", url: "/admin/departments" },
  { name: "ปีงบ", url: "/admin/fiscal-years" },
  { name: "เพิ่มเครื่อง", url: "/admin/add-asset" },
  { name: "นำเข้าทรัพย์สิน", url: "/admin/add-asset?tab=import" },
  { name: "ตรวจยืนยันการติดตั้ง", url: "/admin/installation-review" },
  { name: "เปรียบเทียบ", url: "/compare", fixture: "compare", roles: ["admin", "staff", "viewer"], states: ["data", "empty", "loading", "error"] },
  { name: "งานนำเข้า", url: "/admin/import", fixture: "import-list", roles: ["admin"], states: ["data", "empty", "loading", "error"] },
  { name: "รายละเอียดงานนำเข้า", url: "/admin/import/:session", fixture: "import-detail", roles: ["admin"], states: ["data", "missing", "loading", "error"] },
  { name: "ประวัติการแก้ไข", url: "/admin/audit-log", fixture: "audit", roles: ["admin"], states: ["data", "empty", "loading", "error"] },
];

// Existing real-database sweep stays intact. Synthetic route × role × state
// targets run in accessibility-pages.spec.js without requiring business data.
export const DB_PAGES = PAGES.filter((target) => !target.fixture);
export const FIXTURE_PAGES = PAGES.filter((target) => target.fixture);
