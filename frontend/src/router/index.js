import { createRouter, createWebHistory } from "vue-router";

import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import AssetList from "../views/AssetList.vue";
import ImportDevices from "../views/ImportDevices.vue";
import Expense from "../views/Expense.vue";
import Report from "../views/Report.vue";
import PrintTransactions from "../views/PrintTransactions.vue";


// Lazy Load
const AssetForm = () =>
  import("../views/AssetForm.vue");

const Brand = () =>
  import("../views/admin/Brand.vue");

const Device = () =>
  import("../views/admin/Device.vue");



const routes = [

  // Login
  {
    path: "/login",
    name: "Login",
    component: Login,
  },


  // Dashboard
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
  },


  {
    path: "/dashboard",
    name: "DashboardPage",
    component: Dashboard,
  },


  // Asset List
  {
    path: "/assets",
    name: "AssetList",
    component: AssetList,
  },


  // Add Asset
  {
    path: "/add-asset",
    name: "AddAsset",
    component: AssetForm,
  },


  // Edit Asset
  {
    path: "/edit-asset/:id",
    name: "EditAsset",
    component: () =>
      import("../views/AssetForm.vue"),
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


  // Import Devices
  {
    path: "/import-devices",
    name: "ImportDevices",
    component: ImportDevices,
  },


  // Print Transactions
  {
    path: "/print-transactions",
    name: "PrintTransactions",
    component: PrintTransactions,
  },


  // Admin Brand
  {
    path: "/admin/brands",
    name: "Brands",
    component: Brand,
  },


  // Admin Device
  {
    path: "/admin/devices",
    name: "Devices",
    component: Device,
  },


];



const router = createRouter({

  history: createWebHistory(),

  routes,

});



// Auth Guard
router.beforeEach((to) => {


  const token =
    localStorage.getItem("token");


  const user = JSON.parse(
    localStorage.getItem("user") || "null"
  );



  // ถ้าไม่ login ให้ไปหน้า login
  if (
    to.path !== "/login" &&
    !token
  ) {

    return "/login";

  }



  // Admin เท่านั้น
  if (
    to.path.startsWith("/admin") &&
    user?.role !== "admin"
  ) {

    return "/";

  }



  return true;


});



export default router;