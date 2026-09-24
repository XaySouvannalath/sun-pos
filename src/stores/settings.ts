import { computed, watchEffect } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { defaultSettings } from '@/data/seed'
import { roundTo } from '@/utils/pos'
import { embedded } from '@/utils/env'
import type { Settings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  // Merge with defaults so newly added settings get a value on old installs.
  // The embedded preview follows the viewer's theme by default.
  const initial = (): Settings => ({ ...defaultSettings, theme: embedded ? 'system' : 'light' })
  const stored = persisted<Settings>('settings', initial)
  stored.value = { ...defaultSettings, ...stored.value }
  const s = stored

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

  const isDark = computed(
    () => s.value.theme === 'dark' || (s.value.theme === 'system' && systemDark),
  )

  watchEffect(() => {
    if (typeof document !== 'undefined')
      document.documentElement.classList.toggle('dark', isDark.value)
  })

  function toggleTheme() {
    s.value.theme = isDark.value ? 'light' : 'dark'
  }

  function reset() {
    s.value = { ...defaultSettings }
  }

  return { s, money, round, isDark, toggleTheme, reset }
})
