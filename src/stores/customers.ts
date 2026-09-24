import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Customer, CustomerInput } from '@/types'

export const useCustomersStore = defineStore('customers', () => {
  const customers = ref<Customer[]>([])
  const byId = computed(() => new Map(customers.value.map((c) => [c.id, c])))

  async function load() {
    customers.value = await api.customers.list()
  }

  /** Instant search over the loaded customers (the API also supports GET /customers?q=). */
  function search(q: string): Customer[] {
    const s = q.trim().toLowerCase()
    if (!s) return customers.value
    const digits = s.replace(/\s/g, '')
    return customers.value.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.phone.replace(/\s/g, '').includes(digits) ||
        c.email.toLowerCase().includes(s),
    )
  }

  function put(c: Customer) {
    const i = customers.value.findIndex((x) => x.id === c.id)
    if (i >= 0) customers.value[i] = c
    else customers.value.unshift(c)
  }

  async function save(data: CustomerInput & { id?: string }): Promise<Customer> {
    const { id, ...body } = data
    const saved = id ? await api.customers.update(id, body) : await api.customers.create(body)
    put(saved)
    return saved
  }

  async function remove(id: string) {
    await api.customers.remove(id)
    customers.value = customers.value.filter((c) => c.id !== id)
  }

  /** Re-reads one customer, e.g. after a sale changed their points. */
  async function refresh(id: string) {
    put(await api.customers.get(id))
  }

  return { customers, byId, load, search, save, remove, refresh }
})
