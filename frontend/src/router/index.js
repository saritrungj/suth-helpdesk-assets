import { createRouter, createWebHistory } from "vue-router";

import Login from "../views/Login.vue";
import Dashboard from "../views/Dashboard.vue";
import AssetList from "../views/AssetList.vue";
import ImportDevices from "../views/ImportDevices.vue";
import Expense from "../views/Expense.vue";
import Report from "../views/Report.vue";

// Lazy Load
const AssetForm = () => import("../views/AssetForm.vue");
const Brand = () => import("../views/admin/Brand.vue");
const Device = () => import("../views/admin/Device.vue");

const routes = [
  {
    path: "/login",
    name: "Login",
    component: Login,
  },
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
  },
  {
    path: "/assets",
    name: "AssetList",
    component: AssetList,
  },
  {
    path: "/add-asset",
    name: "AssetForm",
    component: AssetForm,
  },
  {
    path: "/expense",
    name: "Expense",
    component: Expense,
  },
  {
    path: "/report",
    name: "Report",
    component: Report,
  },
  {
    path: "/import-devices",
    name: "ImportDevices",
    component: ImportDevices,
  },
  {
    path: "/admin/brands",
    component: Brand,
  },
  {
    path: "/admin/devices",
    component: Device,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (to.path !== "/login" && !token) {
    return "/login";
  }

  if (to.path.startsWith("/admin") && user?.role !== "admin") {
    return "/";
  }

  return true;
});

export default router;