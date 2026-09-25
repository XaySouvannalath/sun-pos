import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { localDate } from '@/utils/rates'
import type { EffectiveRates, ExchangeRateSet, RateEntry } from '@/types'

/** The day's exchange rates, and the history managers edit on the Exchange rates screen. */
export const useRatesStore = defineStore('rates', () => {
  const current = ref<EffectiveRates | null>(null)
  const history = ref<ExchangeRateSet[]>([])

  const today = computed(() => localDate())
  /** True when nobody has set rates for today yet (earlier rates may still apply). */
  const missingToday = computed(
    () => !!current.value && current.value.effectiveDate !== today.value,
  )

  async function load() {
    current.value = await api.exchangeRates.get(localDate())
  }

  async function loadHistory(limit = 30) {
    history.value = await api.exchangeRates.history(limit)
  }

  async function save(date: string, rates: RateEntry[]) {
    const set = await api.exchangeRates.set(date, rates)
    await Promise.all([load(), loadHistory()])
    return set
  }

  async function remove(date: string) {
    await api.exchangeRates.remove(date)
    await Promise.all([load(), loadHistory()])
  }

  return { current, history, today, missingToday, load, loadHistory, save, remove }
})
