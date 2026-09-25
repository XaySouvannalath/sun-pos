import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { KitchenTicket, TicketStatus } from '@/types'

/** Kitchen and bar tickets. Screens that show them call `watch()` to keep them fresh. */
export const useKitchenStore = defineStore('kitchen', () => {
  const active = ref<KitchenTicket[]>([])
  const recent = ref<KitchenTicket[]>([])
  const loaded = ref(false)

  /** Tables with food or drinks ready to serve. */
  const readyTables = computed(
    () =>
      new Set(active.value.filter((t) => t.status === 'ready' && t.tableId).map((t) => t.tableId!)),
  )

  async function load() {
    ;[active.value, recent.value] = await Promise.all([
      api.tickets.list({ status: 'active' }),
      api.tickets.list({ status: 'done', limit: 20 }),
    ])
    loaded.value = true
  }

  function replace(t: KitchenTicket) {
    active.value = active.value.filter((x) => x.id !== t.id)
    recent.value = recent.value.filter((x) => x.id !== t.id)
    if (t.status === 'done') recent.value.unshift(t)
    else active.value = [...active.value, t].sort((a, b) => a.createdAt - b.createdAt)
  }

  async function setStatus(id: string, status: TicketStatus) {
    replace(await api.tickets.update(id, { status }))
  }

  async function toggleItem(t: KitchenTicket, index: number) {
    replace(await api.tickets.update(t.id, { item: index, done: !t.items[index]!.done }))
  }

  // Polling: tickets come from other tills, so screens refresh every few seconds.
  let timer: ReturnType<typeof setInterval> | null = null
  let watchers = 0
  function watch(every = 5000) {
    watchers++
    void load().catch(() => null)
    timer ??= setInterval(() => void load().catch(() => null), every)
    return () => {
      if (--watchers === 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }

  return { active, recent, loaded, readyTables, load, setStatus, toggleItem, watch }
})
