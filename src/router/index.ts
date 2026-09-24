import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import SellView from '@/views/SellView.vue'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { embedded } from '@/utils/env'

const router = createRouter({
  // The embedded preview can't use the page URL, so it keeps routes in memory.
  history: embedded ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
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

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  if (!to.meta.public && !auth.user) return { name: 'lock', query: { next: to.fullPath } }
  if (to.meta.admin && !auth.isAdmin) return { name: 'sell' }
  const app = useAppStore()
  if (auth.user && !to.meta.public && !app.loaded) {
    try {
      await app.load()
    } catch (e) {
      useToastStore().show(e instanceof Error ? e.message : 'Could not load data', 'error', 5000)
    }
  }
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
