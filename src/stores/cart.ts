import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { ApiError } from '@/api/client'
import { persisted } from '@/composables/persisted'
import { t } from '@/i18n'
import { clone, computeTotals, discountPercent, lineKey, mergeLines, uid } from '@/utils/pos'
import { useApprovalStore } from './approval'
import { useAuthStore } from './auth'
import { applyPromotions } from '@/utils/promotions'
import { useSettingsStore } from './settings'
import { useOrdersStore } from './orders'
import { useCatalogStore } from './catalog'
import { useShiftStore } from './shift'
import { useCustomersStore } from './customers'
import type {
  Discount,
  HeldOrder,
  HeldOrderInput,
  KitchenTicket,
  TicketLineInput,
  VoidLine,
  Order,
  OrderLine,
  OrderType,
  Payment,
  Product,
  SelectedOption,
  SelfOrder,
} from '@/types'

interface CartState {
  lines: OrderLine[]
  discount: Discount
  orderType: OrderType
  table: string
  /** The table on the floor plan, if any (`table` holds its name). */
  tableId?: string | null
  note: string
  customerId: string | null
  /** The saved bill this order was opened from; saving or paying updates that bill. */
  heldId?: string | null
  /** That bill's `updatedAt` when it was opened here: guest (QR) orders added since are kept. */
  version?: number | null
  /** Items removed after being sent, to report to the kitchen as cancelled. */
  voids?: VoidLine[]
  /** A manager's approval for the current discount, when it is above the cashier's limit. */
  discountApprovalId?: string | null
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
  tableId: null,
  note: '',
  customerId: null,
  heldId: null,
  version: null,
  voids: [],
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
  // Promotions depend on the time (happy hour), so the clock ticks once a minute.
  const now = ref(Date.now())
  if (typeof window !== 'undefined') setInterval(() => (now.value = Date.now()), 60000)
  const catalogForPromos = useCatalogStore()
  const promosFor = (lines: OrderLine[]) =>
    applyPromotions(
      lines,
      catalogForPromos.promotions,
      new Date(now.value),
      useAuthStore().branchId || undefined,
      settings.s.decimals,
    )
  /** Totals of any bill, with the promotions running now. */
  const billTotals = (lines: OrderLine[], discount: Discount) =>
    computeTotals(lines, discount, settings.s, promosFor(lines).total)
  /** Promotions on the order on screen, with what each saves. */
  const promotions = computed(() => promosFor(state.value.lines).applied)
  const totals = computed(() =>
    computeTotals(
      state.value.lines,
      state.value.discount,
      settings.s,
      promotions.value.reduce((s, p) => s + p.amount, 0),
    ),
  )
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
    const part = billTotals(lines, { type: 'percent', value: 0 })
    const fullBase = full.subtotal - (full.promo ?? 0)
    const partBase = part.subtotal - (part.promo ?? 0)
    const value = fullBase ? settings.round((full.discount * partBase) / fullBase) : 0
    return { lines, discount: { type: 'amount', value } }
  }

  function selectionTotals(selection: Selection) {
    const p = portion(selection)
    return billTotals(p.lines, p.discount)
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

  /** Taking away items the kitchen already has: remember them, so the kitchen is told. */
  const controls = () => settings.s.controls
  const approval = useApprovalStore()

  /**
   * Changes a line's quantity. Taking away items the kitchen already has needs a manager
   * (when that control is on) and is reported to the kitchen as cancelled.
   * Resolves false if the manager's approval was cancelled.
   */
  async function setQty(index: number, qty: number): Promise<boolean> {
    const l = state.value.lines[index]
    if (!l) return false
    const sent = l.sentQty ?? 0
    const newQty = Math.max(qty, 0)
    if (sent > newQty) {
      let approvalId: string | null = null
      if (controls().approveVoids) {
        approvalId = await approval.ask('void', { detail: `${sent - newQty} × ${l.name}` })
        if (approvalId === null) return false
      }
      ;(state.value.voids ??= []).push({
        ...clone(l),
        qty: sent - newQty,
        sentQty: 0,
        approvalId: approvalId || null,
      })
      l.sentQty = newQty
    }
    const i = state.value.lines.indexOf(l)
    if (newQty <= 0) state.value.lines.splice(i, 1)
    else l.qty = newQty
    return true
  }

  function remove(index: number) {
    return setQty(index, 0)
  }

  /** The whole discount (items and order) as a percent, and whether it needs a manager. */
  const discountPct = computed(() =>
    discountPercent(state.value.lines, state.value.discount, settings.s),
  )
  const overLimit = (pct: number) =>
    !useAuthStore().isAdmin && pct > controls().discountLimitPct + 0.01

  /**
   * Asks a manager to approve a discount above the cashier's limit. Call it after changing a
   * discount. If cancelled, the discount goes back to `undo`.
   */
  async function approveDiscount(undo: () => void): Promise<boolean> {
    const pct = discountPct.value
    if (!overLimit(pct)) return true
    const id = await approval.ask('discount', {
      amount: pct,
      detail: `${Math.round(pct * 10) / 10}%`,
    })
    if (id === null) {
      undo()
      return false
    }
    state.value.discountApprovalId = id
    return true
  }

  /** Whether the kitchen already has any of these items (or has cancellations to hear about). */
  const wasSent = (lines: OrderLine[], voids: OrderLine[] = []) =>
    lines.some((l) => (l.sentQty ?? 0) > 0) || voids.length > 0

  /** Deleting an order the kitchen has seen needs a manager. Null means it was cancelled. */
  async function approveDelete(lines: OrderLine[], voids: OrderLine[] = []) {
    if (!wasSent(lines, voids) || !controls().approveVoids) return ''
    return approval.ask('void', {
      detail: lines.map((l) => `${l.qty} × ${l.name}`).join(', '),
    })
  }

  /** Empties the screen (the order itself is kept if it was saved as a bill). */
  function clear() {
    state.value = emptyCart()
  }

  /**
   * "Clear order": throws the order away, including its saved bill. It is recorded in the
   * activity log. Resolves false if a manager's approval was needed and cancelled.
   */
  async function discard(): Promise<boolean> {
    const c = state.value
    if (!c.lines.length && !c.heldId) {
      clear()
      return true
    }
    const approvalId = await approveDelete(c.lines, c.voids)
    if (approvalId === null) return false
    if (c.heldId) {
      const id = c.heldId
      await api.held.remove(id, approvalId || null)
      held.value = held.value.filter((x) => x.id !== id)
    } else
      await api.activity.clearedOrder({
        total: totals.value.total,
        items: c.lines.map((l) => `${l.qty} × ${l.name}`).join(', '),
        table: c.table,
        sent: wasSent(c.lines, c.voids),
        approvalId: approvalId || null,
      })
    clear()
    return true
  }

  const catalog = useCatalogStore()
  /** Whether a product's category is prepared at a station (kitchen, bar…). */
  const hasStation = (categoryId: string) => !!catalog.categoryById.get(categoryId)?.stationId

  const unsentLines = computed(() =>
    state.value.lines.filter((l) => l.qty > (l.sentQty ?? 0) && hasStation(l.categoryId)),
  )
  /** Items (or cancellations) the kitchen and bar don't know about yet. */
  const hasUnsent = computed(
    () =>
      unsentLines.value.length > 0 ||
      (state.value.voids ?? []).some((v) => hasStation(v.categoryId)),
  )

  const ticketLine = (l: VoidLine, qty: number, cancelled = false): TicketLineInput => ({
    productId: l.productId,
    qty,
    options: l.options.map((o) => o.name),
    note: l.note,
    cancelled,
    approvalId: cancelled ? (l.approvalId ?? null) : null,
  })

  /** Bills waiting on the server, other than the one on screen. */
  const waiting = computed(() => held.value.filter((h) => h.id !== state.value.heldId))
  const heldForTable = (tableId: string) => held.value.find((h) => h.tableId === tableId)

  async function loadHeld() {
    held.value = await api.held.list()
  }

  function heldInput(label: string): HeldOrderInput {
    const c = clone(state.value)
    return {
      label,
      lines: c.lines,
      discount: c.discount,
      orderType: c.orderType,
      table: c.table,
      tableId: c.tableId ?? null,
      note: c.note,
      customerId: c.customerId,
      voids: c.voids ?? [],
      version: c.version ?? undefined,
    }
  }

  function upsertHeld(h: HeldOrder) {
    const i = held.value.findIndex((x) => x.id === h.id)
    if (i >= 0) held.value[i] = h
    else held.value.unshift(h)
  }

  /** Saves the order as a bill on the server (updating its bill if it has one) and clears the screen. */
  async function hold(label = '') {
    if (isEmpty.value) return
    const c = state.value
    const name =
      label ||
      (c.table
        ? t('cart.tableN', { n: c.table })
        : t('cart.orderN', { n: waiting.value.length + 1 }))
    const h = c.heldId
      ? await api.held.update(c.heldId, heldInput(name))
      : await api.held.create(heldInput(name))
    upsertHeld(h)
    clear()
  }

  function load(h: HeldOrder) {
    state.value = {
      lines: clone(h.lines),
      discount: h.discount,
      orderType: h.orderType,
      table: h.table,
      tableId: h.tableId,
      note: h.note,
      customerId: h.customerId,
      heldId: h.id,
      version: h.updatedAt,
      voids: clone(h.voids ?? []),
      pendingId: null,
      pendingSig: null,
    }
  }

  /** Opens a saved bill. The order on screen is saved first, so nothing is lost. */
  async function resume(id: string) {
    if (state.value.heldId === id) return
    if (!isEmpty.value) await hold()
    await loadHeld()
    const h = held.value.find((x) => x.id === id)
    if (!h) throw new Error(t('tables.billGone'))
    load(h)
  }

  /** Floor plan: opens the table's bill, or starts a new order for it. */
  async function openTable(table: { id: string; name: string }) {
    const bill = heldForTable(table.id)
    if (bill) return resume(bill.id)
    if (state.value.tableId === table.id) return
    if (!isEmpty.value) await hold()
    clear()
    Object.assign(state.value, { tableId: table.id, table: table.name, orderType: 'dine-in' })
  }

  /** Puts the order on screen at a table (or takes it off tables with null). */
  function setTable(table: { id: string; name: string } | null) {
    const c = state.value
    c.tableId = table?.id ?? null
    c.table = table?.name ?? ''
    if (table) c.orderType = 'dine-in'
  }

  /** Moves the order on screen to another table (its saved bill and kitchen tickets too). */
  async function moveTo(table: { id: string; name: string }) {
    const c = state.value
    if (c.heldId) upsertHeld(await api.held.move(c.heldId, table.id))
    setTable(table)
  }

  /**
   * Sends new items (and cancellations) to the kitchen and bar. A table's order is then saved
   * to its table and the screen cleared, ready for the next table.
   */
  async function send(): Promise<{ tickets: KitchenTicket[]; parked: boolean }> {
    const c = state.value
    const lines = [
      ...c.lines
        .filter((l) => l.qty > (l.sentQty ?? 0))
        .map((l) => ticketLine(l, l.qty - (l.sentQty ?? 0))),
      ...(c.voids ?? []).map((v) => ticketLine(v, v.qty, true)),
    ]
    const tickets = lines.length
      ? await api.tickets.create({
          label: c.table ? t('cart.tableN', { n: c.table }) : '',
          orderType: c.orderType,
          table: c.table,
          tableId: c.tableId ?? null,
          note: c.note,
          lines,
        })
      : []
    for (const l of c.lines) l.sentQty = l.qty
    c.voids = []
    const parked = !!(c.tableId || c.heldId)
    if (parked) await hold()
    return { tickets, parked }
  }

  /**
   * Merge bill: combines held orders with the current order, on the server. Tables are joined
   * ("5 + 6"), notes kept, and the first customer found is used. Amount discounts add up;
   * otherwise the current order's discount (or the first merged bill's) is kept.
   */
  async function mergeHeld(ids: string[]) {
    let rest = [...ids]
    const c = state.value
    if (c.heldId) upsertHeld(await api.held.update(c.heldId, heldInput(label())))
    else if (isEmpty.value) {
      // Nothing on screen: start from the first chosen bill.
      const first = held.value.find((h) => h.id === rest[0])
      if (!first) return
      load(first)
      rest = rest.slice(1)
    } else {
      const h = await api.held.create(heldInput(label()))
      upsertHeld(h)
      c.heldId = h.id
      c.version = h.updatedAt
    }
    if (!rest.length) return
    const merged = await api.held.merge(state.value.heldId!, rest)
    held.value = held.value.filter((x) => !rest.includes(x.id))
    upsertHeld(merged)
    load(merged)
  }

  const label = () =>
    state.value.table
      ? t('cart.tableN', { n: state.value.table })
      : t('cart.orderN', { n: waiting.value.length + 1 })

  /**
   * A guest (QR) order was accepted onto its table's bill. If that bill is open here, its items
   * are added on screen too, already sent, so saving the bill keeps them.
   */
  function guestOrderAccepted(order: SelfOrder, h: HeldOrder) {
    upsertHeld(h)
    const c = state.value
    const here = c.heldId === h.id || (!c.heldId && c.tableId && c.tableId === h.tableId)
    if (!here) return
    if (isEmpty.value) return load(h)
    c.lines = mergeLines(
      c.lines,
      order.lines.map((l) => ({ ...l, sentQty: l.qty })),
    )
    c.heldId = h.id
    c.version = h.updatedAt
  }

  /** Deletes a held bill (logged; needs a manager if the kitchen had it). */
  async function discardHeld(id: string): Promise<boolean> {
    const h = held.value.find((x) => x.id === id)
    const approvalId = h ? await approveDelete(h.lines, h.voids) : ''
    if (approvalId === null) return false
    await api.held.remove(id, approvalId || null)
    held.value = held.value.filter((x) => x.id !== id)
    return true
  }

  /** Sends the order to the server, which prices it, deducts stock and returns the saved order. */
  async function checkout(payments: Payment[], opts: CheckoutOptions = {}): Promise<Order> {
    const c = state.value
    const part = portion(opts.selection)
    // A discount above the cashier's limit needs a manager; each approval is used once.
    const pct = discountPercent(part.lines, part.discount, settings.s)
    if (overLimit(pct) && !c.discountApprovalId) {
      const id = await approval.ask('discount', {
        amount: pct,
        detail: `${Math.round(pct * 10) / 10}%`,
      })
      if (id === null) throw new Error(t('approval.cancelled'))
      c.discountApprovalId = id
    }
    // Paying for part of a saved bill leaves the bill open for the rest.
    const all = !opts.selection || c.lines.every((l) => (opts.selection![l.id!] ?? 0) >= l.qty)
    const body = {
      orderType: c.orderType,
      table: c.table,
      tableId: c.tableId ?? null,
      heldId: all ? (c.heldId ?? null) : null,
      heldVersion: all && c.heldId ? (c.version ?? undefined) : undefined,
      voids: (c.voids ?? []).map((v) => ticketLine(v, v.qty, true)),
      note: c.note,
      customerId: c.customerId,
      orderDiscount: part.discount,
      lines: part.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        options: l.options.map((o) => ({ group: o.group, name: o.name })),
        note: l.note,
        discountPct: l.discountPct,
        sentQty: Math.min(l.sentQty ?? 0, l.qty),
      })),
      splitWays: opts.splitWays,
      discountApprovalId: c.discountApprovalId || null,
    }
    // Retrying the same order reuses its id; anything different is a new order.
    const sig = JSON.stringify(body)
    if (c.pendingSig !== sig || !c.pendingId) {
      c.pendingId = uid()
      c.pendingSig = sig
    }
    let order: Order
    try {
      order = await api.orders.create({ id: c.pendingId, ...body, payments })
    } catch (e) {
      // Guests added items to this bill from the QR code: show the bill as it is now.
      if (e instanceof ApiError && e.code === 'BILL_CHANGED' && c.heldId) {
        await loadHeld()
        const h = held.value.find((x) => x.id === c.heldId)
        if (h) load(h)
      }
      throw e
    }
    c.discountApprovalId = null
    if (opts.selection) {
      // Split by items: keep what hasn't been paid for yet.
      const sel = opts.selection
      c.lines = c.lines
        .map((l) => {
          const paid = Math.min(sel[l.id!] ?? 0, l.qty)
          const sentPaid = Math.min(l.sentQty ?? 0, paid)
          return { ...l, qty: l.qty - paid, sentQty: (l.sentQty ?? 0) - sentPaid }
        })
        .filter((l) => l.qty > 0)
      c.voids = []
      if (c.discount.type === 'amount')
        c.discount = {
          type: 'amount',
          value: settings.round(Math.max(c.discount.value - order.discount, 0)),
        }
      c.pendingId = null
      c.pendingSig = null
      if (!c.lines.length) clear()
      else if (c.heldId) {
        const h = await api.held.update(c.heldId, heldInput(t('cart.tableN', { n: c.table })))
        upsertHeld(h)
        // The bill may have gained guest (QR) items meanwhile.
        c.lines = clone(h.lines)
        c.version = h.updatedAt
      }
    } else {
      if (body.heldId) held.value = held.value.filter((x) => x.id !== body.heldId)
      clear()
    }
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
    discountPct,
    approveDiscount,
    promotions,
    billTotals,
    now,
    clear,
    loadHeld,
    hold,
    resume,
    openTable,
    setTable,
    moveTo,
    send,
    discard,
    hasUnsent,
    unsentLines,
    hasStation,
    waiting,
    heldForTable,
    discardHeld,
    guestOrderAccepted,
    mergeHeld,
    portion,
    selectionTotals,
    checkout,
  }
})
