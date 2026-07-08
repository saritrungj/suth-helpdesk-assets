import { createRouter, createWebHistory } from 'vue-router'

import Login from '../views/Login.vue'
import ImportDevices from '../views/ImportDevices.vue'
import Dashboard from '../views/Dashboard.vue'
import AssetList from '../views/AssetList.vue'
import AssetForm from '../views/AssetForm.vue'
import Expense from '../views/Expense.vue'
import Report from '../views/Report.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
    path: '/admin/brands',
    component: () => import('../views/admin/Brand.vue')
  },
  {
    path: '/assets',
    name: 'AssetList',
    component: AssetList
  },
  {
    path: '/add-asset',
    name: 'AssetForm',
    component: AssetForm
  },
  {
    path: '/expense',
    name: 'Expense',
    component: Expense
  },
  {
    path: '/report',
    name: 'Report',
    component: Report
  },
  {
    path: '/import-devices',
    name: 'ImportDevices',
    component: ImportDevices
  },
  {
    path: '/admin/devices',
    component: () => import('../views/admin/Device.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Route Guard
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  // ถ้ายังไม่ได้ Login
  if (to.path !== "/login" && !token) {
    return next("/login");
  }

  // ถ้าเป็นหน้า Admin แต่ไม่ใช่ admin
  if (to.path.startsWith("/admin") && user?.role !== "admin") {
    return next("/");
  }

  next();
});

export default router