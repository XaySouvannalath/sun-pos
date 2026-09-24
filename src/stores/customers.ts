import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { uid } from '@/utils/pos'
import type { Customer } from '@/types'

export const useCustomersStore = defineStore('customers', () => {
  const customers = persisted<Customer[]>('customers', () => [])
  const byId = computed(() => new Map(customers.value.map((c) => [c.id, c])))

  function search(q: string): Customer[] {
    const s = q.trim().toLowerCase()
    if (!s) return customers.value
    return customers.value.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.phone.replace(/\s/g, '').includes(s.replace(/\s/g, '')) ||
        c.email.toLowerCase().includes(s),
    )
  }

  function save(data: Pick<Customer, 'name' | 'phone' | 'email' | 'note'> & { id?: string }) {
    const existing = data.id ? byId.value.get(data.id) : undefined
    if (existing) {
      Object.assign(existing, data)
      return existing
    }
    const c: Customer = {
      id: uid(),
      name: data.name,
      phone: data.phone,
      email: data.email,
      note: data.note,
      points: 0,
      totalSpent: 0,
      visits: 0,
      createdAt: Date.now(),
    }
    customers.value.unshift(c)
    return c
  }

  function remove(id: string) {
    customers.value = customers.value.filter((c) => c.id !== id)
  }

  /** Apply (or with sign -1, reverse) a purchase on the customer's record. */
  function recordPurchase(id: string, total: number, points: number, sign: 1 | -1 = 1) {
    const c = byId.value.get(id)
    if (!c) return
    c.totalSpent = Math.max(0, c.totalSpent + sign * total)
    c.points = Math.max(0, c.points + sign * points)
    c.visits = Math.max(0, c.visits + sign)
  }

  function reset() {
    customers.value = []
  }

  return { customers, byId, search, save, remove, recordPurchase, reset }
})
