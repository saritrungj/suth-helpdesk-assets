import { t } from "../lib/locale";
import { createRouter, createWebHistory } from "vue-router";

import { authState } from "../store/auth";
import Login from "../views/Login.vue";

/**
 * router/index.js — เส้นทางทั้งหมดของเว็บ
 *
 * ทุกหน้ายกเว้น Login ถูกโหลดแบบ lazy (import ตอนเข้าหน้านั้นจริง) ด้วยเหตุผล
 * สองข้อ
 *
 *   1. ขนาดไฟล์ก้อนแรกที่ผู้ใช้ต้องดาวน์โหลดตอนเปิดเว็บเล็กลงมาก — สำคัญกับ
 *      เครื่องในโรงพยาบาลที่หลายเครื่องยังเป็นสเปกเก่าและเน็ตภายในไม่เร็ว
 *   2. ตัดวงจร import ที่วนกลับมาหาตัวเอง (router -> หน้า -> store/fiscalYear ->
 *      router) ซึ่งทำให้ hot reload ตอนพัฒนาพังด้วย "Cannot access before
 *      initialization" ทุกครั้งที่แก้ไฟล์หน้าแรก
 *
 * Login ยังโหลดตรงๆ เพราะเป็นหน้าที่ผู้ใช้ที่ยังไม่ล็อกอินเห็นเป็นหน้าแรกเสมอ
 * การให้รอโหลดอีกก้อนก่อนเห็นช่องกรอกไม่คุ้ม
 */

const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login,
    meta: { layout: "auth" },
  },

  { path: "/", redirect: "/dashboard" },

  {
    path: "/dashboard",
    name: "Dashboard",
    component: () => import("../views/Dashboard.vue"),
  },

  // ทะเบียนทรัพย์สิน — เปิดให้ทุกคนที่ล็อกอินแล้วดูได้เหมือนหน้ารายงาน
  // ส่วนการเพิ่ม/แก้ไข/ลบ เป็นสิทธิ์ของ admin ซึ่ง API เป็นผู้บังคับ
  {
    path: "/assets",
    name: "AssetList",
    component: () => import("../views/AssetList.vue"),
  },

  // รายละเอียดของเครื่องเดียว — Serial ในตารางทะเบียนลิงก์มาที่นี่
  //
  // ตั้งใจไม่ใส่ตัวจำกัดรูปแบบ (`:id(\\d+)`) เพราะในสตริงของ JavaScript ต้องเขียน
  // แบ็กสแลชสองตัว ซึ่งพลาดได้ง่ายมากและพลาดแล้วเงียบสนิท — เขียนตัวเดียวจะได้
  // รูปแบบ `(d+)` ที่แปลว่า "ตัวอักษร d หนึ่งตัวขึ้นไป" แล้ว /assets/17 จะไม่ตรง
  // กับเส้นทางไหนเลย ตกไปที่ catch-all แล้วเด้งกลับหน้าแรกโดยไม่มีข้อความบอก
  //
  // id ที่ไม่ใช่ตัวเลขไม่เป็นอันตราย — API ตอบ 400/404 และหน้านี้แสดง
  // "ไม่พบเครื่องนี้" ให้อยู่แล้ว
  {
    path: "/assets/:id",
    name: "AssetDetail",
    component: () => import("../views/AssetDetail.vue"),
    // ชื่อขั้นสุดท้ายของ breadcrumb — หน้านี้ไม่มีรายการเมนูของตัวเอง
    meta: { breadcrumb: t("รายละเอียดเครื่อง") },
  },

  // ค่าใช้จ่าย + ยอดพิมพ์แยกตามฝ่าย/แผนก อยู่หน้าเดียวกันเป็นแท็บ
  // ?tab=expense (ค่าเริ่มต้น) | ?tab=department
  {
    path: "/expense",
    name: "Expense",
    component: () => import("../views/UsageReport.vue"),
  },

  // path เดิมก่อนรวมสองหน้าเข้าด้วยกัน — เก็บไว้กันลิงก์เก่าและบุ๊กมาร์กพัง
  {
    path: "/by-department",
    redirect: (to) => ({ path: "/expense", query: { ...to.query, tab: "department" } }),
  },

  {
    path: "/compare",
    name: "Compare",
    component: () => import("../views/Compare.vue"),
  },

  {
    path: "/report",
    name: "Report",
    component: () => import("../views/Report.vue"),
  },

  {
    path: "/print-transactions",
    name: "PrintTransactions",
    component: () => import("../views/PrintTransactions.vue"),
  },

  // =======================
  // ข้อมูลอ้างอิงและการตั้งค่า — ผู้ดูแลระบบเท่านั้น
  // =======================
  { path: "/admin/brands", name: "Brands", component: () => import("../views/admin/Brand.vue") },
  { path: "/admin/buildings", name: "Buildings", component: () => import("../views/admin/Building.vue") },
  { path: "/admin/floors", name: "Floors", component: () => import("../views/admin/Floor.vue") },
  { path: "/admin/divisions", name: "Divisions", component: () => import("../views/admin/Division.vue") },
  { path: "/admin/departments", name: "Departments", component: () => import("../views/admin/Department.vue") },
  { path: "/admin/fiscal-years", name: "FiscalYears", component: () => import("../views/admin/FiscalYear.vue") },
  { path: "/admin/contracts", name: "Contracts", component: () => import("../views/admin/Contract.vue") },
  { path: "/admin/add-asset", name: "AddAsset", component: () => import("../views/admin/AddAsset.vue") },
  { path: "/admin/users", name: "Users", component: () => import("../views/admin/Users.vue") },

  // การนำเข้าไฟล์กลายเป็นแท็บในหน้าเพิ่มทรัพย์สินแล้ว — เก็บ path เดิมไว้ redirect
  {
    path: "/admin/import-devices",
    redirect: { path: "/admin/add-asset", query: { tab: "import" } },
  },

  // เส้นทางที่ไม่มีอยู่จริง — พากลับหน้าแรกแทนหน้าขาว
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

const router = createRouter({
  history: createWebHistory(),

  routes,

  // เปลี่ยนหน้าแล้วเลื่อนขึ้นบนสุดเสมอ ยกเว้นตอนกดปุ่มย้อนกลับ/ไปข้างหน้าของ
  // เบราว์เซอร์ ซึ่งควรกลับไปตำแหน่งเดิมที่เคยอ่านค้างไว้
  scrollBehavior(to, from, savedPosition) {
    // The expense workspace restores the position of each retained tab itself.
    if (to.path === "/expense") return false;
    return savedPosition ?? { top: 0 };
  },
});

// =======================
// ด่านตรวจสิทธิ์
//
// อ่านผลของ GET /auth/me ที่ main.js ถามไว้ก่อน mount แทนการอ่าน token เอง —
// token อยู่ใน cookie แบบ httpOnly ที่ JavaScript อ่านไม่ได้ (ดู ADR-0006)
//
// การซ่อนเมนู admin ฝั่งเว็บเป็นเรื่องของประสบการณ์ใช้งาน ไม่ใช่ความปลอดภัย
// ตัวที่บังคับสิทธิ์จริงคือ middleware ฝั่ง API เสมอ
// =======================
router.beforeEach((to) => {
  const isLoggedIn = Boolean(authState.user);
  const role = authState.user?.role;

  if (to.path !== "/login" && !isLoggedIn) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }

  if (to.path === "/login" && isLoggedIn) {
    return { path: "/dashboard" };
  }

  if (to.path.startsWith("/admin") && role !== "admin") {
    return { path: "/dashboard" };
  }

  return true;
});

export default router;
