// Business rules shared by the mock API: rankings, shift cash-up and reports.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type {
  BreakdownBy,
  BreakdownRow,
  Order,
  PaymentMethod,
  Product,
  ProductSales,
  ReportSummary,
  SalesBucket,
  Shift,
  ShiftSummary,
  TopSeller,
} from '../types.ts'
import { lineTotal, netCash, roundTo } from '../utils/pos.ts'

const DAY = 86400000

/** Quantity and revenue per product for completed orders since `since`, best first. */
export function rankProducts(
  orders: Order[],
  products: Map<string, Product>,
  since: number,
): TopSeller[] {
  const agg = new Map<string, { qty: number; revenue: number }>()
  for (const o of orders) {
    if (o.status !== 'completed' || o.createdAt < since) continue
    for (const l of o.lines) {
      const a = agg.get(l.productId) ?? { qty: 0, revenue: 0 }
      a.qty += l.qty
      a.revenue += lineTotal(l)
      agg.set(l.productId, a)
    }
  }
  const out: TopSeller[] = []
  for (const [id, a] of agg) {
    const product = products.get(id)
    if (product) out.push({ product, ...a })
  }
  return out.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
}

/**
 * Cash-up for a shift. Expected cash =
 * opening float + cash sales (net of change) − cash refunds + cash in − cash out.
 */
export function shiftSummary(shift: Shift, orders: Order[], decimals: number): ShiftSummary {
  const r = (n: number) => roundTo(n, decimals)
  const byMethod: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 }
  let count = 0
  let gross = 0
  let cashSales = 0
  let refunds = 0
  let refunded = 0
  let cashRefunds = 0
  for (const o of orders) {
    if (o.shiftId === shift.id) {
      count++
      gross += o.total
      const cash = netCash(o.payments, o.change)
      cashSales += cash
      byMethod.cash += cash
      for (const p of o.payments) if (p.method !== 'cash') byMethod[p.method] += p.amount
    }
    if (o.refund && o.refund.shiftId === shift.id) {
      refunds++
      refunded += o.total
      cashRefunds += netCash(o.payments, o.change)
    }
  }
  const sum = (type: 'in' | 'out') =>
    shift.cashMoves.filter((m) => m.type === type).reduce((s, m) => s + m.amount, 0)
  const cashIn = sum('in')
  const cashOut = sum('out')
  return {
    orders: count,
    refunds,
    gross: r(gross),
    refunded: r(refunded),
    byMethod: { cash: r(byMethod.cash), card: r(byMethod.card), qr: r(byMethod.qr) },
    cashSales: r(cashSales),
    cashRefunds: r(cashRefunds),
    cashIn: r(cashIn),
    cashOut: r(cashOut),
    expectedCash: r(shift.openingFloat + cashSales - cashRefunds + cashIn - cashOut),
  }
}

export function inRange(orders: Order[], from: number, to: number) {
  return orders.filter((o) => o.createdAt >= from && o.createdAt < to)
}

export function reportSummary(
  orders: Order[],
  products: Map<string, Product>,
  decimals: number,
): ReportSummary {
  const r = (n: number) => roundTo(n, decimals)
  const c = orders.filter((o) => o.status === 'completed')
  const net = c.reduce((s, o) => s + o.total, 0)
  const discounts = c.reduce(
    (s, o) => s + o.discount + o.lines.reduce((x, l) => x + l.unitPrice * l.qty - lineTotal(l), 0),
    0,
  )
  // Profit estimate: revenue before tax and service, minus each product's current cost.
  const cost = c.reduce(
    (s, o) => s + o.lines.reduce((x, l) => x + (products.get(l.productId)?.cost ?? 0) * l.qty, 0),
    0,
  )
  const revenue = c.reduce((s, o) => s + o.subtotal - o.discount, 0)
  const refunded = orders.filter((o) => o.status === 'refunded')
  return {
    net: r(net),
    orders: c.length,
    avg: r(c.length ? net / c.length : 0),
    items: c.reduce((s, o) => s + o.itemCount, 0),
    tax: r(c.reduce((s, o) => s + o.tax, 0)),
    discounts: r(discounts),
    profit: r(revenue - cost),
    margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
    refunds: r(refunded.reduce((s, o) => s + o.total, 0)),
    refundCount: refunded.length,
  }
}

function hourIn(ts: number, timeZone?: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone,
    }).format(ts)
    return Number(h)
  } catch {
    return new Date(ts).getHours()
  }
}

function dateIn(ts: number, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(ts) // YYYY-MM-DD
  } catch {
    return new Date(ts).toISOString().slice(0, 10)
  }
}

/** Sales per hour of day (6:00–22:00) or per day from `from`, in the shop's time zone. */
export function salesByTime(
  orders: Order[],
  from: number,
  to: number,
  bucket: 'hour' | 'day',
  decimals: number,
  timeZone?: string,
): SalesBucket[] {
  const c = orders.filter((o) => o.status === 'completed')
  const buckets: SalesBucket[] = []
  if (bucket === 'hour') {
    for (let h = 6; h <= 22; h++)
      buckets.push({ start: from + h * 3600000, label: String(h), value: 0, count: 0 })
    for (const o of c) {
      const b = buckets[hourIn(o.createdAt, timeZone) - 6]
      if (b) {
        b.value += o.total
        b.count++
      }
    }
  } else {
    const days = Math.max(1, Math.ceil((Math.min(to, Date.now()) - from) / DAY))
    for (let i = 0; i < days; i++) {
      const start = from + i * DAY
      buckets.push({ start, label: dateIn(start, timeZone), value: 0, count: 0 })
    }
    for (const o of c) {
      const b = buckets[Math.floor((o.createdAt - from) / DAY)]
      if (b) {
        b.value += o.total
        b.count++
      }
    }
  }
  for (const b of buckets) b.value = roundTo(b.value, decimals)
  return buckets
}

export function productSales(orders: Order[], decimals: number): ProductSales[] {
  const m = new Map<string, ProductSales>()
  for (const o of orders) {
    if (o.status !== 'completed') continue
    for (const l of o.lines) {
      const row = m.get(l.productId) ?? {
        productId: l.productId,
        name: l.name,
        emoji: l.emoji,
        qty: 0,
        revenue: 0,
      }
      row.qty += l.qty
      row.revenue += lineTotal(l)
      m.set(l.productId, row)
    }
  }
  return [...m.values()]
    .map((row) => ({ ...row, revenue: roundTo(row.revenue, decimals) }))
    .sort((a, b) => b.qty - a.qty)
}

export function breakdown(
  orders: Order[],
  by: BreakdownBy,
  categoryName: (id: string) => string,
  decimals: number,
): BreakdownRow[] {
  const m = new Map<string, number>()
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  for (const o of orders) {
    if (o.status !== 'completed') continue
    if (by === 'payment')
      for (const p of o.payments)
        add(p.method, p.method === 'cash' ? Math.max(p.amount - o.change, 0) : p.amount)
    else if (by === 'category')
      for (const l of o.lines) add(categoryName(l.categoryId), lineTotal(l))
    else if (by === 'orderType') add(o.orderType, o.total)
    else add(o.staffName || '—', o.total)
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0) || 1
  return [...m.entries()]
    .map(([key, v]) => ({ key, value: roundTo(v, decimals), pct: (v / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}
