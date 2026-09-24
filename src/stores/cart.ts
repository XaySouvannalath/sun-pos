import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { persisted } from '@/composables/persisted'
import { clone, computeTotals, lineKey, uid } from '@/utils/pos'
import { useSettingsStore } from './settings'
import { useOrdersStore } from './orders'
import { useCatalogStore } from './catalog'
import { useShiftStore } from './shift'
import { useCustomersStore } from './customers'
import type {
  Discount,
  HeldOrder,
  Order,
  OrderLine,
  OrderType,
  Payment,
  Product,
  SelectedOption,
} from '@/types'

interface CartState {
  lines: OrderLine[]
  discount: Discount
  orderType: OrderType
  table: string
  note: string
  customerId: string | null
  /** Order id reused if a checkout is retried, so the customer is never charged twice. */
  pendingId?: string | null
}

const emptyCart = (): CartState => ({
  lines: [],
  discount: { type: 'percent', value: 0 },
  orderType: 'dine-in',
  table: '',
  note: '',
  customerId: null,
  pendingId: null,
})

/** Options pre-selected when a product is added in one tap: the first choice of each required group. */
export function defaultOptions(p: Product): SelectedOption[] {
  return p.options
    .filter((g) => g.required && g.choices.length)
    .map((g) => ({ group: g.name, name: g.choices[0]!.name, price: g.choices[0]!.price }))
}

export const useCartStore = defineStore('cart', () => {
  // The order being built stays on this device and survives a page reload.
  const state = persisted<CartState>('cart', emptyCart)
  // Held orders live on the server so any till can resume them.
  const held = ref<HeldOrder[]>([])

  const settings = useSettingsStore()
  const totals = computed(() => computeTotals(state.value.lines, state.value.discount, settings.s))
  const isEmpty = computed(() => state.value.lines.length === 0)

  // Any change to the order means a new checkout, so drop the retry id.
  watch(
    () => [state.value.lines, state.value.discount, state.value.customerId],
    () => (state.value.pendingId = null),
    { deep: true },
  )

  function add(p: Product, options: SelectedOption[] = defaultOptions(p), qty = 1) {
    const key = lineKey(p.id, options)
    const existing = state.value.lines.find((l) => l.key === key && !l.note && !l.discountPct)
    if (existing) {
      existing.qty += qty
      return
    }
    state.value.lines.push({
      id: uid(),
      key,
      productId: p.id,
      name: p.name,
      emoji: p.emoji,
      categoryId: p.categoryId,
      unitPrice: settings.round(p.price + options.reduce((s, o) => s + o.price, 0)),
      qty,
      options,
      note: '',
      discountPct: 0,
    })
  }

  function setQty(index: number, qty: number) {
    const l = state.value.lines[index]
    if (!l) return
    if (qty <= 0) state.value.lines.splice(index, 1)
    else l.qty = qty
  }

  function remove(index: number) {
    state.value.lines.splice(index, 1)
  }

  function clear() {
    state.value = emptyCart()
  }

  async function loadHeld() {
    held.value = await api.held.list()
  }

  async function hold(label: string) {
    if (isEmpty.value) return
    const { lines, discount, orderType, table, note, customerId } = clone(state.value)
    const h = await api.held.create({
      label: label || `Order ${held.value.length + 1}`,
      lines,
      discount,
      orderType,
      table,
      note,
      customerId,
    })
    held.value.unshift(h)
    clear()
  }

  async function resume(id: string) {
    // Park whatever is on screen so nothing is lost when switching orders.
    if (!isEmpty.value) await hold(state.value.table ? `Table ${state.value.table}` : '')
    const h = await api.held.remove(id)
    held.value = held.value.filter((x) => x.id !== id)
    state.value = {
      lines: h.lines,
      discount: h.discount,
      orderType: h.orderType,
      table: h.table,
      note: h.note,
      customerId: h.customerId,
      pendingId: null,
    }
  }

  async function discardHeld(id: string) {
    await api.held.remove(id)
    held.value = held.value.filter((x) => x.id !== id)
  }

  /** Sends the order to the server, which prices it, deducts stock and returns the saved order. */
  async function checkout(payments: Payment[]): Promise<Order> {
    const c = state.value
    c.pendingId ??= uid()
    const order = await api.orders.create({
      id: c.pendingId,
      orderType: c.orderType,
      table: c.table,
      note: c.note,
      customerId: c.customerId,
      orderDiscount: c.discount,
      lines: c.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        options: l.options.map((o) => ({ group: o.group, name: o.name })),
        note: l.note,
        discountPct: l.discountPct,
      })),
      payments,
    })
    clear()
    // Stock, the drawer, top sellers and loyalty points changed on the server.
    void Promise.allSettled([
      useCatalogStore().refreshProducts(),
      useShiftStore().load(),
      useOrdersStore().loadTopSellers(),
      order.customerId ? useCustomersStore().refresh(order.customerId) : null,
    ])
    return order
  }

  return {
    state,
    held,
    totals,
    isEmpty,
    add,
    setQty,
    remove,
    clear,
    loadHeld,
    hold,
    resume,
    discardHeld,
    checkout,
  }
})
