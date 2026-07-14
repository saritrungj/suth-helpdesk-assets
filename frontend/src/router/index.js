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



const AssetForm = () =>
  import("../views/AssetForm.vue");


// Admin

const Brand = () =>
  import("../views/admin/Brand.vue");


const Device = () =>
  import("../views/admin/Device.vue");


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


  // Asset
  {
    path: "/assets",
    name: "AssetList",
    component: AssetList,
  },

  {
    path: "/add-asset",
    name: "AddAsset",
    component: AssetForm,
  },

  {
    path: "/edit-asset/:id",
    name: "EditAsset",
    component: AssetForm,
  },


  // Expense
  {
    path: "/expense",
    name: "Expense",
    component: Expense,
  },


  // Report
  {
    path: "/report",
    name: "Report",
    component: Report,
  },


  // Import
  {
    path: "/import-devices",
    name: "ImportDevices",
    component: ImportDevices,
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
    path: "/admin/devices",
    name: "Devices",
    component: Device,
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


];



// =======================
// Router
// =======================

const router = createRouter({

  history: createWebHistory(),

  routes,

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