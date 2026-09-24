import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router'
import SellView from '@/views/SellView.vue'
import { watch } from 'vue'
import { language, t, type MessageKey } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { embedded } from '@/utils/env'

const router = createRouter({
  // The embedded preview can't use the page URL, so it keeps routes in memory.
  history: embedded ? createMemoryHistory() : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'sell', component: SellView, meta: { title: 'nav.sell' } },
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
      meta: { title: 'nav.orders' },
    },
    {
      path: '/shift',
      name: 'shift',
      component: () => import('@/views/ShiftView.vue'),
      meta: { title: 'nav.shift' },
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@/views/CustomersView.vue'),
      meta: { title: 'nav.customers' },
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('@/views/ProductsView.vue'),
      meta: { title: 'nav.products', admin: true },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
      meta: { title: 'nav.stock', admin: true },
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('@/views/ReportsView.vue'),
      meta: { title: 'nav.reports', admin: true },
    },
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/ImportView.vue'),
      meta: { title: 'nav.import', admin: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: 'nav.settings', admin: true },
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
      useToastStore().show(e instanceof Error ? e.message : t('errors.load'), 'error', 5000)
    }
  }
})

function setTitle() {
  const key = router.currentRoute.value.meta.title
  document.title = key ? `${t(key)} · Sun POS` : 'Sun POS'
}
router.afterEach(setTitle)
watch(language, setTitle)

declare module 'vue-router' {
  interface RouteMeta {
    /** Translation key for the browser tab title. */
    title?: MessageKey
    public?: boolean
    admin?: boolean
  }
}

export default router
