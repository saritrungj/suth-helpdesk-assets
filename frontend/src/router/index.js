import { createRouter, createWebHistory } from "vue-router";

import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import AssetList from "../views/AssetList.vue";


// =======================
// Lazy Load Pages
// =======================

// Expense.vue และ ByDepartment.vue ถูกรวมเข้าเป็นหน้าเดียว (แท็บ) ที่ UsageReport.vue แล้ว
// ทั้งสอง route เดิมด้านล่างจึงชี้มาที่คอมโพเนนต์เดียวกันนี้ ต่างกันแค่แท็บเริ่มต้น
const UsageReport = () =>
  import("../views/UsageReport.vue");


const Report = () =>
  import("../views/Report.vue");


const Compare = () =>
  import("../views/Compare.vue");

// PrintTransactions.vue แยกกลับมาเป็น route ของตัวเอง (ไม่ได้รวมกับหน้าค่าใช้จ่ายแล้ว)
const PrintTransactions = () =>
  import("../views/PrintTransactions.vue");

// Admin

const Brand = () =>
  import("../views/admin/Brand.vue");


const Building = () =>
  import("../views/admin/Building.vue");


const Floor = () =>
  import("../views/admin/Floor.vue");


const Division = () =>
  import("../views/admin/Division.vue");


const Department = () =>
  import("../views/admin/Department.vue");


const FiscalYear = () =>
  import("../views/admin/FiscalYear.vue");


const Contract = () =>
  import("../views/admin/Contract.vue");


const AddAsset = () =>
  import("../views/admin/AddAsset.vue");


const Users = () =>
  import("../views/admin/Users.vue");


// =======================
// Routes
// =======================

const routes = [

  {
  path: "/login",
  name: "Login",
  component: Login,
  meta: { layout: "auth" },
  },


  // Dashboard
  {
    path: "/",
    redirect: "/dashboard",
  },

  {
    path: "/dashboard",
    name: "Dashboard",
    component: Dashboard,
  },


  // Asset (ดูรายการ — เปิดให้ผู้ใช้ที่ login แล้วทุกคน เหมือนหน้ารายงานอื่นๆ)
  {
    path: "/assets",
    name: "AssetList",
    component: AssetList,
  },


  // Expense + ยอดพิมพ์แยกตามฝ่าย/แผนก — รวมเป็นหน้าเดียว (แท็บ) ที่ UsageReport.vue
  // ?tab=expense (default) | ?tab=department
  {
    path: "/expense",
    name: "Expense",
    component: UsageReport,
  },


  {
    path: "/compare",
    name: "Compare",
    component: Compare,
  },

  // ByDepartment — ย้ายไปรวมกับหน้าค่าใช้จ่ายแล้ว (ดูคอมเมนต์ที่ /expense) เก็บ path เดิมไว้
  // redirect กันลิงก์เก่า/บุ๊กมาร์กพัง (แบบเดียวกับ /admin/import-devices)
  {
    path: "/by-department",
    redirect: (to) => ({ path: "/expense", query: { ...to.query, tab: "department" } }),
  },
  // Report
  {
    path: "/report",
    name: "Report",
    component: Report,
  },


  // Print — แยกกลับมาเป็น route เดี่ยวของตัวเอง (ไม่ได้รวมกับหน้าค่าใช้จ่ายแล้ว)
  {
    path: "/print-transactions",
    name: "PrintTransactions",
    component: PrintTransactions,
  },


  // =======================
  // Admin Master Data
  // =======================

  {
    path: "/admin/brands",
    name: "Brands",
    component: Brand,
  },

  {
    path: "/admin/buildings",
    name: "Buildings",
    component: Building,
  },

  {
    path: "/admin/floors",
    name: "Floors",
    component: Floor,
  },

  {
    path: "/admin/divisions",
    name: "Divisions",
    component: Division,
  },

  {
    path: "/admin/departments",
    name: "Departments",
    component: Department,
  },

  {
    path: "/admin/fiscal-years",
    name: "FiscalYears",
    component: FiscalYear,
  },

  {
    path: "/admin/contracts",
    name: "Contracts",
    component: Contract,
  },

  // เพิ่มทรัพย์สิน — อยู่ฝั่ง Admin (ตรงกับลิงก์ในเมนู Admin > อุปกรณ์ > "เพิ่มทรัพย์สิน")
  // ใช้ AssetForm.vue ตัวเดียวกับที่ AssetList.vue ใช้ตอน "แก้ไข" (ดู views/admin/AddAsset.vue)
  // การกันสิทธิ์ POST ยังคงถูกบังคับที่ backend (adminMiddleware) เหมือนเดิม
  {
    path: "/admin/add-asset",
    name: "AddAsset",
    component: AddAsset,
  },

  // Import CSV/Excel — รวมเข้าไปเป็นแท็บในหน้า "เพิ่มทรัพย์สิน" แล้ว (ดู views/admin/AddAsset.vue)
  // เก็บ path เดิมไว้ redirect กันลิงก์เก่า/บุ๊กมาร์กพัง
  {
    path: "/admin/import-devices",
    redirect: { path: "/admin/add-asset", query: { tab: "import" } },
  },

  {
    path: "/admin/users",
    name: "Users",
    component: Users,
  },


];



// =======================
// Router
// =======================

const router = createRouter({

  history: createWebHistory(),

  routes,

  // ทุกครั้งที่เปลี่ยนหน้า ให้เลื่อนขึ้นบนสุดเสมอ
  // (ยกเว้นตอนกดปุ่ม back/forward ของ browser จะกลับไปตำแหน่งเดิมที่เคยอยู่)
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0 };
  },

});



// =======================
// Auth Guard
// =======================

router.beforeEach((to) => {


  const token =
    localStorage.getItem("token");


  const user =
    JSON.parse(
      localStorage.getItem("user") || "{}"
    );



  // ไม่ login
  if (
    to.path !== "/login" &&
    !token
  ) {

    return {
      path: "/login",
      query: { redirect: to.fullPath },
    };

  }



  // Login แล้ว ไม่ควรกลับ login
  if (
    to.path === "/login" &&
    token
  ) {

    return {
      path: "/dashboard",
    };

  }



  // Admin only
  if (
    to.path.startsWith("/admin") &&
    user.role !== "admin"
  ) {

    return {
      path: "/dashboard",
    };

  }



  return true;

});


export default router;