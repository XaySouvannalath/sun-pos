<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ShoppingCart,
  Receipt,
  Package,
  Boxes,
  Users,
  ChartColumn,
  Wallet,
  Settings,
  Lock,
  Sun,
  Moon,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import { useCatalogStore } from '@/stores/catalog'

const auth = useAuthStore()
const settings = useSettingsStore()
const catalog = useCatalogStore()
const router = useRouter()

const links = computed(() =>
  [
    { to: '/', label: 'Sell', icon: ShoppingCart },
    { to: '/orders', label: 'Orders', icon: Receipt },
    { to: '/shift', label: 'Shift', icon: Wallet },
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/products', label: 'Products', icon: Package, admin: true },
    { to: '/inventory', label: 'Stock', icon: Boxes, admin: true, badge: catalog.lowStock.length },
    { to: '/reports', label: 'Reports', icon: ChartColumn, admin: true },
    { to: '/settings', label: 'Settings', icon: Settings, admin: true },
  ].filter((l) => !l.admin || auth.isAdmin),
)

async function lock() {
  await auth.logout()
  useAppStore().reset()
  await router.push('/lock')
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-line bg-surface md:static md:h-full md:w-22 md:flex-col md:border-t-0 md:border-r"
  >
    <div class="hidden flex-col items-center py-4 md:flex">
      <div
        class="grid size-11 place-items-center rounded-2xl bg-primary text-xl text-primary-ink"
        title="Sun POS"
      >
        ☀
      </div>
    </div>

    <div class="flex flex-1 overflow-x-auto md:flex-col md:gap-1 md:overflow-y-auto md:px-2">
      <RouterLink
        v-for="l in links"
        :key="l.to"
        :to="l.to"
        class="relative flex min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink md:h-16 md:flex-none"
        exact-active-class="!bg-primary-soft !text-primary"
      >
        <component :is="l.icon" class="size-5" />
        {{ l.label }}
        <span
          v-if="l.badge"
          class="absolute top-1.5 right-2.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] text-primary-ink md:right-3"
          >{{ l.badge }}</span
        >
      </RouterLink>
    </div>

    <div class="flex items-center gap-1 px-2 md:flex-col md:gap-2 md:py-4">
      <button
        class="btn btn-ghost btn-icon"
        :title="settings.isDark ? 'Light theme' : 'Dark theme'"
        @click="settings.toggleTheme()"
      >
        <Sun v-if="settings.isDark" class="size-5" />
        <Moon v-else class="size-5" />
      </button>
      <button class="btn btn-ghost btn-icon" title="Lock / switch staff" @click="lock">
        <Lock class="size-5" />
      </button>
      <div
        class="hidden size-10 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent md:grid"
        :title="auth.user?.name"
      >
        {{ auth.user?.name.charAt(0) }}
      </div>
    </div>
  </nav>
</template>
