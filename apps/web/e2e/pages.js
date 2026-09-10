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

/** ทุกหน้าหลังล็อกอิน — ต้องเพิ่มที่นี่ทุกครั้งที่เพิ่มหน้าใหม่ */
export const PAGES = [
  { name: "แดชบอร์ด", url: "/dashboard" },
  { name: "บันทึกยอดพิมพ์", url: "/print-transactions" },
  { name: "ทะเบียนทรัพย์สิน", url: "/assets" },
  { name: "รายละเอียดเครื่อง", url: "/assets/:fixture" },
  { name: "ค่าใช้จ่าย", url: "/expense" },
  { name: "เปรียบเทียบรายเดือน", url: "/compare" },
  { name: "รายงานสรุป", url: "/report" },
  { name: "สัญญา", url: "/admin/contracts" },
  { name: "จัดการผู้ใช้งาน", url: "/admin/users" },
  { name: "ยี่ห้อ", url: "/admin/brands" },
  { name: "อาคาร", url: "/admin/buildings" },
  { name: "ชั้น", url: "/admin/floors" },
  { name: "ฝ่าย", url: "/admin/divisions" },
  { name: "แผนก", url: "/admin/departments" },
  { name: "ปีงบ", url: "/admin/fiscal-years" },
  { name: "เพิ่มทรัพย์สิน", url: "/admin/add-asset" },
  { name: "นำเข้าทรัพย์สิน", url: "/admin/add-asset?tab=import" },
  { name: "ค่าใช้จ่ายแยกแผนก", url: "/expense?tab=department" },
];
