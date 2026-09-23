import { t } from "../lib/locale";
import { createRouter, createWebHistory } from "vue-router";

import { authState } from "../store/auth";
import Login from "../views/Login.vue";
import { installPageMemory } from "../lib/page-memory";
import { setAppRouter } from "../lib/app-router";

/**
 * router/index.js — เส้นทางทั้งหมดของเว็บ
 *
 * ทุกหน้ายกเว้น Login ถูกโหลดแบบ lazy (import ตอนเข้าหน้านั้นจริง) เพื่อให้ไฟล์ก้อนแรก
 * ที่ผู้ใช้ต้องดาวน์โหลดตอนเปิดเว็บเล็กลงมาก — สำคัญกับเครื่องในโรงพยาบาลที่หลายเครื่อง
 * ยังเป็นสเปกเก่าและเน็ตภายในไม่เร็ว
 *
 * Login ยังโหลดตรงๆ เพราะเป็นหน้าที่ผู้ใช้ที่ยังไม่ล็อกอินเห็นเป็นหน้าแรกเสมอ
 * การให้รอโหลดอีกก้อนก่อนเห็นช่องกรอกไม่คุ้ม
 *
 * **ห้ามให้โมดูลอื่น import ไฟล์นี้** (ยกเว้น main.js) — เคยมีวง
 * `services/api.js → router/index.js → views/Login.vue → services/api.js` ซึ่งทำให้
 * hot reload พังเป็นจอขาวด้วย "Cannot access 'router' before initialization" โค้ดที่อยู่
 * นอก component ให้หยิบ router จาก `lib/app-router.js` แทน มีเทสบังคับกฎนี้ไว้ที่
 * `lib/app-router.test.js` เพราะการโหลดหน้าแบบ lazy กันวงนี้ไม่ได้ (Login โหลดตรงๆ)
 */

const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login,
    // ?redirect= เป็นของการล็อกอินครั้งนั้น ไม่ใช่มุมมองที่ควรจำ (#115)
    meta: { layout: "auth", remember: false },
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
    beforeEnter: (to) => to.query.tab === "department"
      ? { path: "/dashboard", query: { ...to.query, tab: undefined, by: "division" } }
      : true,
  },

  // path เดิมก่อนรวมทุกหน้าวิเคราะห์เข้าหน้าภาพรวม — เก็บไว้กันลิงก์เก่าและบุ๊กมาร์กพัง
  {
    path: "/by-department",
    redirect: (to) => ({ path: "/dashboard", query: { ...to.query, by: "division" } }),
  },

  // หน้าเปรียบเทียบเดิม (ดู ADR-0020) — "แบบการเทียบ + รายการที่เลือก" ของหน้านั้น
  // กลายเป็น "เปรียบเทียบตาม + ตัวกรอง" ของหน้าภาพรวม ซึ่งเป็นความหมายเดียวกัน
  // ค่าที่แปลงไม่ได้ถูกตัดทิ้ง แล้วหน้าภาพรวมเปิดด้วยค่าเริ่มต้นแทนการเดาให้เงียบๆ
  {
    path: "/compare",
    redirect: (to) => {
      const value = (key) => (Array.isArray(to.query[key]) ? to.query[key][0] : to.query[key]);
      const type = value("type");
      // ค้นด้วย Map ไม่ใช่ object เพราะ `type` มาจาก URL — `?type=constructor` จะได้
      // ฟังก์ชันบน prototype กลับมาเป็น "ชื่อมิติ" แล้วหลุดเข้าไปอยู่ใน URL ปลายทาง
      const by = new Map([["contract", "contract"], ["building", "building"], ["year", "fiscalYear"]]).get(type)
        ?? (type === "department" ? (value("level") === "department" ? "department" : "division") : undefined);
      // รายการที่เคยเลือกมาเทียบ = ตัวกรองของมิตินั้นในหน้าใหม่
      const chosen = value("items") ?? (type === "year" ? undefined : value("groups"));
      const scope = new Map([["contract", "contract"], ["building", "building"], ["department", "department"], ["division", "division"]]).get(by);
      return {
        path: "/dashboard",
        query: {
          fy: to.query.fy,
          by,
          months: value("months"),
          years: type === "year" ? value("groups") ?? value("years") : value("years"),
          measure: value("measure") ?? (value("metric") === "totalPages" || value("metric") === "netPages" ? "pages" : undefined),
          // รายการที่เคยหยิบมาเทียบ และตัวกรองสัญญา/อาคารของหน้าเดิม มีความหมายเดียวกับตัวกรองชื่อเดียวกันในหน้าใหม่
          contract: scope === "contract" ? chosen : value("contract"),
          building: scope === "building" ? chosen : value("building"),
          department: scope === "department" ? chosen : value("department"),
          division: scope === "division" ? chosen : value("division"),
        },
      };
    },
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
  {
    path: "/admin/add-asset",
    name: "AddAsset",
    component: () => import("../views/admin/AddAsset.vue"),
    // หน้าลูกของทะเบียน — breadcrumb "งานประจำ › ทะเบียนเครื่องพิมพ์ › เพิ่มเครื่อง"
    meta: { breadcrumb: t("เพิ่มเครื่อง") },
  },
  { path: "/admin/users", name: "Users", component: () => import("../views/admin/Users.vue") },

  // ตรวจยืนยันสถานะการติดตั้งของเครื่องเดิม (ADR-0018) — ไม่มีรายการในเมนูถาวร
  // เพราะเป็นงานที่ทำครั้งเดียวแล้วจบ เข้าจากคำเตือนบนแดชบอร์ดหรือ Ctrl+K
  {
    path: "/admin/installation-review",
    name: "InstallationReview",
    component: () => import("../views/admin/InstallationReview.vue"),
  },

  // นำเข้าไฟล์จากผู้ให้เช่า — ทางเข้าเดียวของทั้งทะเบียนและยอด งานค้างอยู่บนเซิร์ฟเวอร์ (#180, ADR-0027)
  { path: "/admin/import", name: "ImportSessions", component: () => import("../views/admin/ImportSessions.vue") },
  {
    path: "/admin/import/:id",
    name: "ImportSession",
    component: () => import("../views/admin/ImportSession.vue"),
    meta: { breadcrumb: t("งานนำเข้า") },
  },

  // path เดิมของหน้านำเข้าทะเบียน — เก็บไว้ redirect กันลิงก์และบุ๊กมาร์กพัง
  { path: "/admin/import-devices", redirect: "/admin/import" },

  // เส้นทางที่ไม่มีอยู่จริง — พากลับหน้าแรกแทนหน้าขาว
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

const router = createRouter({
  history: createWebHistory(),

  routes,

  /**
   * เปลี่ยนหน้าแล้วเลื่อนขึ้นบนสุด แต่ **เปลี่ยนตัวกรองไม่ใช่การเปลี่ยนหน้า**
   *
   * หน้าที่เก็บมุมมองไว้ใน URL เรียก `router.replace` ทุกครั้งที่ผู้ใช้แตะตัวกรอง
   * และ vue-router เรียก scrollBehavior ทุกการนำทางรวมถึง replace ที่เปลี่ยนแค่
   * query ผลคือกดตัวกรองที่อยู่กลางหน้าแล้วจอกระโดดขึ้นบนสุดทุกครั้ง จนรู้สึก
   * เหมือนหน้าโหลดใหม่และหาที่ค้างไว้ไม่เจอ (#126)
   *
   * savedPosition มีค่าเฉพาะตอนกดย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์ ซึ่งควรกลับไป
   * ตำแหน่งเดิมที่เคยอ่านค้างไว้
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});

/*
 * ฝาก instance ไว้ให้โค้ดที่อยู่นอก component ทันทีที่สร้างเสร็จ
 *
 * โมดูลอย่าง services/api.js และ store/fiscalYear.js ต้องสั่งนำทางได้ แต่ห้าม import
 * ไฟล์นี้กลับไป ไม่งั้นเกิดวง import ที่ทำให้ hot reload พังเป็นจอขาว (ดู lib/app-router.js)
 */
setAppRouter(router);

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

// เปิดหน้าจากเมนูแล้วได้มุมมองล่าสุดของหน้านั้นในแท็บนี้ — ติดตั้งหลังด่านสิทธิ์ (#115)
installPageMemory(router);

export default router;
