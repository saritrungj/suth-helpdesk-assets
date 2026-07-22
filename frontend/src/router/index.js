import { createRouter, createWebHistory } from "vue-router";

import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import AssetList from "../views/AssetList.vue";
import ImportDevices from "../views/ImportDevices.vue";


// =======================
// Lazy Load Pages
// =======================

const Expense = () =>
  import("../views/Expense.vue");


const Report = () =>
  import("../views/Report.vue");


const PrintTransactions = () =>
  import("../views/PrintTransactions.vue");


const Compare = () =>
  import("../views/Compare.vue");

const ByDepartment = () =>
  import("../views/ByDepartment.vue");

const AssetForm = () =>
  import("../views/AssetForm.vue");


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


  // Expense
  {
    path: "/expense",
    name: "Expense",
    component: Expense,
  },


  {
    path: "/compare",
    name: "Compare",
    component: Compare,
  },

  {
  path: "/by-department",
  name: "ByDepartment",
  component: ByDepartment,
},
  // Report
  {
    path: "/report",
    name: "Report",
    component: Report,
  },


  // Print
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

  // เพิ่ม/แก้ไขทรัพย์สิน — ย้ายมาอยู่ใต้ /admin เพราะการเขียนข้อมูล (POST/PUT)
  // ที่ backend บังคับ adminMiddleware อยู่แล้ว ควรถูกกันด้วย route guard ฝั่ง frontend ด้วย
  // ไม่ใช่แค่ซ่อนปุ่ม (การดูรายการที่ /assets ยังเปิดให้ทุกคนเหมือนเดิม)
  {
    path: "/admin/add-asset",
    name: "AddAsset",
    component: AssetForm,
  },

  {
    path: "/admin/edit-asset/:id",
    name: "EditAsset",
    component: AssetForm,
  },

  // Import CSV/Excel — เป็นเครื่องมือของ Admin เช่นกัน
  {
    path: "/admin/import-devices",
    name: "ImportDevices",
    component: ImportDevices,
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