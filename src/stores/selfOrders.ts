import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { t } from '@/i18n'
import { useCartStore } from './cart'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'
import type { SelfOrder } from '@/types'

/** Orders guests placed from the tables' QR codes, waiting for staff. */
export const useSelfOrdersStore = defineStore('selfOrders', () => {
  const pending = ref<SelfOrder[]>([])
  const count = computed(() => pending.value.length)
  const seen = new Set<string>()
  let first = true

  async function load() {
    if (!useSettingsStore().s.selfOrder?.enabled) {
      pending.value = []
      return
    }
    const list = await api.selfOrders.list('pending')
    // Say when a new order comes in (not for the ones already waiting at sign-in).
    const fresh = list.filter((so) => !seen.has(so.id))
    for (const so of list) seen.add(so.id)
    if (!first && fresh.length)
      useToastStore().show(
        fresh.length === 1
          ? t('selfOrder.newOne', { table: fresh[0]!.table })
          : t('selfOrder.newMany', { n: fresh.length }),
        'default',
        6000,
      )
    first = false
    pending.value = list
  }

  async function accept(so: SelfOrder) {
    try {
      const res = await api.selfOrders.accept(so.id)
      useCartStore().guestOrderAccepted(res.order, res.held)
      useToastStore().show(t('selfOrder.accepted', { table: so.table }), 'success')
    } finally {
      await load()
    }
  }

  async function reject(so: SelfOrder, reason: string) {
    try {
      await api.selfOrders.reject(so.id, reason)
    } finally {
      await load()
    }
  }

  // Guests order at any time, so tills check every 10 seconds while someone is signed in.
  let timer: ReturnType<typeof setInterval> | null = null
  function start(every = 10000) {
    void load().catch(() => null)
    timer ??= setInterval(() => void load().catch(() => null), every)
  }
  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    pending.value = []
    seen.clear()
    first = true
  }

  return { pending, count, load, accept, reject, start, stop }
})
