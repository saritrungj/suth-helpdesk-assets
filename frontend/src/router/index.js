import { createRouter, createWebHistory } from "vue-router";

import MainLayout from "../layouts/MainLayout.vue";
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
const Building = () => import("../views/admin/Building.vue");
const Division = () => import("../views/admin/Division.vue");
const FiscalYear = () => import("../views/admin/FiscalYear.vue");
const Contract = () => import("../views/admin/Contract.vue");

const routes = [
  // หน้า Login อยู่นอก Layout — ไม่มี Sidebar/Navbar
  {
    path: "/login",
    name: "Login",
    component: Login,
  },

  // หน้าอื่นทั้งหมดอยู่ใน MainLayout
  {
    path: "/",
    component: MainLayout,
    children: [
      {
        path: "",
        name: "Dashboard",
        component: Dashboard,
      },
      {
        path: "assets",
        name: "AssetList",
        component: AssetList,
      },
      {
        path: "add-asset",
        name: "AssetForm",
        component: AssetForm,
      },
      {
        path: "edit-asset/:id",
        name: "AssetEdit",
        component: AssetForm,
      },
      {
        path: "expense",
        name: "Expense",
        component: Expense,
      },
      {
        path: "report",
        name: "Report",
        component: Report,
      },
      {
        path: "import-devices",
        name: "ImportDevices",
        component: ImportDevices,
      },
      {
        path: "admin/brands",
        component: Brand,
      },
      {
        path: "admin/devices",
        component: Device,
      },
      {
        path: "admin/buildings",
        component: Building,
      },
      {
        path: "admin/divisions",
        component: Division,
      },
      {
        path: "admin/fiscal-years",
        component: FiscalYear,
      },
      {
        path: "admin/contracts",
        component: Contract,
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// หน้าที่ต้องเป็น admin เท่านั้น (API ฝั่ง backend ก็บังคับ admin เช่นกัน)
const ADMIN_ONLY_PREFIXES = ["/admin", "/add-asset", "/edit-asset", "/import-devices"];

router.beforeEach((to) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (to.path !== "/login" && !token) {
    return "/login";
  }

  const needsAdmin = ADMIN_ONLY_PREFIXES.some((p) => to.path.startsWith(p));
  if (needsAdmin && user?.role !== "admin") {
    return "/";
  }

  return true;
});

export default router;
