import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { persisted } from '@/composables/persisted'
import { t } from '@/i18n'
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
  /** What `pendingId` was for: a different order or selection gets a new id. */
  pendingSig?: string | null
}

/** Split by items: quantity of each cart line (by line id) to charge now. */
export type Selection = Record<string, number>

export interface CheckoutOptions {
  /** Charge only these items; the rest stay in the cart. */
  selection?: Selection
  /** The bill is split equally between this many guests (payments carry a guest number). */
  splitWays?: number
}

/** Equal shares of a total: everyone pays the rounded-down share, the last guest the rest. */
export function equalShares(total: number, ways: number, decimals: number): number[] {
  const f = 10 ** decimals
  const share = Math.floor((total * f) / ways + 1e-9) / f
  const last = Math.round((total - share * (ways - 1)) * f) / f
  return [...Array(ways - 1).fill(share), last]
}

const emptyCart = (): CartState => ({
  lines: [],
  discount: { type: 'percent', value: 0 },
  orderType: 'dine-in',
  table: '',
  note: '',
  customerId: null,
  pendingId: null,
  pendingSig: null,
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

  /** Every line needs an id to be picked when splitting (carts saved by older versions lack them). */
  function ensureIds() {
    for (const l of state.value.lines) l.id ??= uid()
  }
  watch(() => state.value.lines.length, ensureIds, { immediate: true })

  /**
   * The part of the order a selection covers. A percentage discount applies as is; an amount
   * discount is shared out in proportion to the items' value.
   */
  function portion(selection?: Selection): { lines: OrderLine[]; discount: Discount } {
    const c = state.value
    if (!selection) return { lines: c.lines, discount: c.discount }
    const lines = c.lines
      .filter((l) => (selection[l.id!] ?? 0) > 0)
      .map((l) => ({ ...clone(l), qty: Math.min(selection[l.id!]!, l.qty) }))
    if (c.discount.type === 'percent') return { lines, discount: { ...c.discount } }
    const full = totals.value
    const part = computeTotals(lines, { type: 'percent', value: 0 }, settings.s)
    const value = full.subtotal
      ? settings.round((full.discount * part.subtotal) / full.subtotal)
      : 0
    return { lines, discount: { type: 'amount', value } }
  }

  function selectionTotals(selection: Selection) {
    const p = portion(selection)
    return computeTotals(p.lines, p.discount, settings.s)
  }

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
      label: label || t('cart.orderN', { n: held.value.length + 1 }),
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
    if (!isEmpty.value)
      await hold(state.value.table ? t('cart.tableN', { n: state.value.table }) : '')
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
      pendingSig: null,
    }
  }

  /** Adds a line from another bill, combining it with an identical plain line. */
  function addLine(line: OrderLine) {
    const plain = (l: OrderLine) => !l.note && !l.discountPct
    const same = plain(line)
      ? state.value.lines.find((l) => l.key === line.key && plain(l))
      : undefined
    if (same) same.qty += line.qty
    else state.value.lines.push({ ...line, id: uid() })
  }

  /**
   * Merge bill: moves held orders into the current order. Tables are joined ("5 + 6"), notes
   * kept, and the first customer found is used. Amount discounts add up; otherwise the current
   * order's discount (or the first merged bill's) is kept.
   */
  async function mergeHeld(ids: string[]) {
    const c = state.value
    const tables = c.table ? [c.table] : []
    const notes = c.note ? [c.note] : []
    const discounts = !isEmpty.value && c.discount.value > 0 ? [c.discount] : []
    const startedEmpty = isEmpty.value
    for (const [i, id] of ids.entries()) {
      const h = await api.held.remove(id)
      held.value = held.value.filter((x) => x.id !== id)
      for (const l of h.lines) addLine(l)
      if (h.table && !tables.includes(h.table)) tables.push(h.table)
      if (h.note) notes.push(h.note)
      if (h.discount.value > 0) discounts.push(h.discount)
      c.customerId ??= h.customerId
      if (startedEmpty && i === 0) c.orderType = h.orderType
      c.table = tables.join(' + ').slice(0, 20)
      c.note = notes.join(' · ').slice(0, 500)
      c.discount =
        discounts.every((d) => d.type === 'amount') && discounts.length
          ? { type: 'amount', value: settings.round(discounts.reduce((s, d) => s + d.value, 0)) }
          : (discounts[0] ?? { type: 'percent', value: 0 })
    }
  }

  async function discardHeld(id: string) {
    await api.held.remove(id)
    held.value = held.value.filter((x) => x.id !== id)
  }

  /** Sends the order to the server, which prices it, deducts stock and returns the saved order. */
  async function checkout(payments: Payment[], opts: CheckoutOptions = {}): Promise<Order> {
    const c = state.value
    const part = portion(opts.selection)
    const body = {
      orderType: c.orderType,
      table: c.table,
      note: c.note,
      customerId: c.customerId,
      orderDiscount: part.discount,
      lines: part.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        options: l.options.map((o) => ({ group: o.group, name: o.name })),
        note: l.note,
        discountPct: l.discountPct,
      })),
      splitWays: opts.splitWays,
    }
    // Retrying the same order reuses its id; anything different is a new order.
    const sig = JSON.stringify(body)
    if (c.pendingSig !== sig || !c.pendingId) {
      c.pendingId = uid()
      c.pendingSig = sig
    }
    const order = await api.orders.create({ id: c.pendingId, ...body, payments })
    if (opts.selection) {
      // Split by items: keep what hasn't been paid for yet.
      const sel = opts.selection
      c.lines = c.lines
        .map((l) => ({ ...l, qty: l.qty - Math.min(sel[l.id!] ?? 0, l.qty) }))
        .filter((l) => l.qty > 0)
      if (c.discount.type === 'amount')
        c.discount = {
          type: 'amount',
          value: settings.round(Math.max(c.discount.value - order.discount, 0)),
        }
      c.pendingId = null
      c.pendingSig = null
      if (!c.lines.length) clear()
    } else clear()
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
    mergeHeld,
    portion,
    selectionTotals,
    checkout,
  }
})
