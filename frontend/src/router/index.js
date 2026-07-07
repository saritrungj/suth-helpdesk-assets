import { createRouter, createWebHistory } from 'vue-router'

import ImportDevices from '../views/ImportDevices.vue'
import Dashboard from '../views/Dashboard.vue'
import AssetList from '../views/AssetList.vue'
import AssetForm from '../views/AssetForm.vue'
import Expense from '../views/Expense.vue'
import Report from '../views/Report.vue'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: Dashboard
  },
  {
  path:"/admin/brands",
  component:
  ()=>import("../views/admin/Brand.vue")
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
    path: "/admin/devices",
    component: () => import("../views/admin/Device.vue")
}
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router