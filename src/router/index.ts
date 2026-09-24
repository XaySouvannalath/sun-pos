import { createRouter, createWebHistory } from 'vue-router'
import SellView from '@/views/SellView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'sell', component: SellView, meta: { title: 'Sell' } },
    {
      path: '/lock',
      name: 'lock',
      component: () => import('@/views/LockView.vue'),
      meta: { public: true },
    },
    {
      path: '/orders',
      name: 'orders',
      component: () => import('@/views/OrdersView.vue'),
      meta: { title: 'Orders' },
    },
    {
      path: '/shift',
      name: 'shift',
      component: () => import('@/views/ShiftView.vue'),
      meta: { title: 'Shift' },
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@/views/CustomersView.vue'),
      meta: { title: 'Customers' },
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('@/views/ProductsView.vue'),
      meta: { title: 'Products', admin: true },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
      meta: { title: 'Stock', admin: true },
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/ReportsView.vue'),
      meta: { title: 'Reports', admin: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: 'Settings', admin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.user) return { name: 'lock', query: { next: to.fullPath } }
  if (to.meta.admin && !auth.isAdmin) return { name: 'sell' }
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Sun POS` : 'Sun POS'
})

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    public?: boolean
    admin?: boolean
  }
}

export default router
