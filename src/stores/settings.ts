import { computed, ref, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { persisted } from '@/composables/persisted'
import { language } from '@/i18n'
import { roundTo } from '@/utils/pos'
import { currencyDecimals } from '@/utils/rates'
import { embedded } from '@/utils/env'
import type { MotionMode, Settings, ThemeMode } from '@/types'

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
  receiptShowRates: true,
}

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<Settings>({ ...fallback })
  // Theme is a per-device preference, so it stays in this browser.
  const theme = persisted<ThemeMode>('theme', () => (embedded ? 'system' : 'light'))
  // Animations are per device too: a slow till can turn them off without affecting others.
  const motion = persisted<MotionMode>('motion', () => 'system')

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

  /** Formats an amount in another currency (e.g. a converted total), in that currency's usual decimals. */
  function moneyIn(n: number, currency: string): string {
    const digits = currencyDecimals(currency)
    try {
      return new Intl.NumberFormat(s.value.locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n || 0)
    } catch {
      return `${currency} ${(n || 0).toFixed(digits)}`
    }
  }

  /** An exchange rate, with as many decimals as it needs (21,850 · 35.52 · 0.9217). */
  function rateNumber(v: number): string {
    const digits = v >= 100 ? 2 : v >= 1 ? 4 : 6
    return new Intl.NumberFormat(s.value.locale, { maximumFractionDigits: digits }).format(v)
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

  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  /** Whether to animate. "system" respects the device's reduce-motion setting. */
  const animate = computed(
    () => motion.value === 'on' || (motion.value === 'system' && !prefersReducedMotion),
  )

  // One class on <html> switches every CSS animation and transition off (see main.css).
  watchEffect(() => {
    if (typeof document !== 'undefined')
      document.documentElement.classList.toggle('motion-off', !animate.value)
  })

  function toggleTheme() {
    theme.value = isDark.value ? 'light' : 'dark'
  }

  // Interface language is per device too (see src/i18n).
  return {
    s,
    theme,
    motion,
    animate,
    language,
    load,
    save,
    money,
    moneyIn,
    rateNumber,
    round,
    isDark,
    toggleTheme,
  }
})
