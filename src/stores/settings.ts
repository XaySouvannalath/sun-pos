import { computed, ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { persisted } from '@/composables/persisted'
import { roundTo } from '@/utils/pos'
import { embedded } from '@/utils/env'
import type { Settings, ThemeMode } from '@/types'

/** Used until the server's settings arrive. */
const fallback: Settings = {
  storeName: 'Sun POS',
  address: '',
  phone: '',
  currency: 'USD',
  locale: 'en-US',
  decimals: 2,
  taxLabel: 'VAT',
  taxRate: 0,
  serviceRate: 0,
  receiptFooter: '',
  pointsPerUnit: 1,
  topSellerDays: 30,
}

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<Settings>({ ...fallback })
  // Theme is a per-device preference, so it stays in this browser.
  const theme = persisted<ThemeMode>('theme', () => (embedded ? 'system' : 'light'))

  async function load() {
    s.value = await api.settings.get()
  }

  async function save(patch: Partial<Settings>) {
    s.value = await api.settings.update(patch)
  }

  const formatter = computed(() => {
    try {
      return new Intl.NumberFormat(s.value.locale, {
        style: 'currency',
        currency: s.value.currency,
        minimumFractionDigits: s.value.decimals,
        maximumFractionDigits: s.value.decimals,
      })
    } catch {
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: s.value.decimals,
        maximumFractionDigits: s.value.decimals,
      })
    }
  })

  function money(n: number): string {
    return formatter.value.format(n || 0)
  }

  function round(n: number): number {
    return roundTo(n, s.value.decimals)
  }

  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null

  // A host page may pin light/dark with data-theme on the root element.
  const hostTheme =
    typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined
  const systemDark = hostTheme ? hostTheme === 'dark' : !!prefersDark?.matches

  const isDark = computed(() => theme.value === 'dark' || (theme.value === 'system' && systemDark))

  watchEffect(() => {
    if (typeof document !== 'undefined')
      document.documentElement.classList.toggle('dark', isDark.value)
  })

  function toggleTheme() {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  return { s, theme, load, save, money, round, isDark, toggleTheme }
})
