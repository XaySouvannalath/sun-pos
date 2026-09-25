// Business rules shared by the mock API: rankings, shift cash-up and reports.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type {
  AuditEntry,
  BreakdownBy,
  DailySummary,
  RiskAlert,
  RiskReport,
  StaffControls,
  StaffRisk,
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

// ---------------------------------------------------------------------------
// Staff activity: risk report and daily summary
// ---------------------------------------------------------------------------

/** Thresholds for warnings. Chosen to be quiet on a normal day. */
export const RISK = {
  /** Voids above this share of the person's sales, or at least `voidCount` of them. */
  voidPct: 3,
  voidCount: 3,
  /** Discounts above this share of the person's sales before discounts. */
  discountPct: 10,
  failedPins: 3,
}

/**
 * Per-staff totals of sensitive actions, and warnings. Uses completed orders for sales and
 * the activity log for everything else.
 */
export function riskReport(
  orders: Order[],
  audit: AuditEntry[],
  from: number,
  to: number,
  controls: StaffControls,
  decimals: number,
): RiskReport {
  const r = (n: number) => roundTo(n, decimals)
  const rows = new Map<string, StaffRisk>()
  const row = (name: string) => {
    let x = rows.get(name)
    if (!x) {
      x = {
        staffName: name,
        sales: 0,
        orders: 0,
        discounts: 0,
        discountCount: 0,
        voids: 0,
        voidCount: 0,
        refunds: 0,
        refundCount: 0,
        cashOut: 0,
        deleted: 0,
        overShort: 0,
        flagged: false,
      }
      rows.set(name, x)
    }
    return x
  }
  for (const o of inRange(orders, from, to)) {
    if (o.status !== 'completed') continue
    const x = row(o.staffName)
    x.sales += o.total
    x.orders++
  }
  const alerts: RiskAlert[] = []
  const failed = new Map<string, number>()
  const deletedCount = new Map<string, number>()
  for (const e of audit) {
    if (e.at < from || e.at >= to) continue
    const x = row(e.staffName)
    if (e.type === 'discount') {
      x.discounts += e.amount
      x.discountCount++
    } else if (e.type === 'void') {
      x.voids += e.amount
      x.voidCount++
    } else if (e.type === 'refund') {
      x.refunds += e.amount
      x.refundCount++
    } else if (e.type === 'cashOut') x.cashOut += e.amount
    else if (e.type === 'orderDeleted') {
      x.deleted += e.amount
      deletedCount.set(e.staffName, (deletedCount.get(e.staffName) ?? 0) + 1)
    } else if (e.type === 'approvalFailed')
      failed.set(e.staffName, (failed.get(e.staffName) ?? 0) + 1)
    else if (e.type === 'shiftClosed') {
      x.overShort += e.amount
      if (Math.abs(e.amount) > controls.cashTolerance)
        alerts.push({
          level: e.amount < 0 ? 'warn' : 'info',
          code: e.amount < 0 ? 'cashShort' : 'cashOver',
          staffName: e.staffName,
          amount: r(Math.abs(e.amount)),
          count: 1,
          pct: 0,
        })
    }
  }
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
  for (const x of rows.values()) {
    const base = { staffName: x.staffName, amount: 0, count: 0, pct: 0 }
    if (x.voidCount && (x.voidCount >= RISK.voidCount || pct(x.voids, x.sales) > RISK.voidPct))
      alerts.push({
        ...base,
        level: 'warn',
        code: 'manyVoids',
        amount: r(x.voids),
        count: x.voidCount,
        pct: pct(x.voids, x.sales),
      })
    const discPct = pct(x.discounts, x.sales + x.discounts)
    if (x.discounts > 0 && discPct > RISK.discountPct)
      alerts.push({
        ...base,
        level: 'warn',
        code: 'highDiscounts',
        amount: r(x.discounts),
        count: x.discountCount,
        pct: discPct,
      })
    if (x.refundCount)
      alerts.push({
        ...base,
        level: 'info',
        code: 'refunds',
        amount: r(x.refunds),
        count: x.refundCount,
      })
    const del = deletedCount.get(x.staffName) ?? 0
    if (del)
      alerts.push({
        ...base,
        level: 'warn',
        code: 'deletedOrders',
        amount: r(x.deleted),
        count: del,
      })
    const f = failed.get(x.staffName) ?? 0
    if (f >= RISK.failedPins) alerts.push({ ...base, level: 'warn', code: 'failedPins', count: f })
  }
  const warned = new Set(alerts.filter((a) => a.level === 'warn').map((a) => a.staffName))
  const staff = [...rows.values()]
    .map((x) => ({
      ...x,
      sales: r(x.sales),
      discounts: r(x.discounts),
      voids: r(x.voids),
      refunds: r(x.refunds),
      cashOut: r(x.cashOut),
      deleted: r(x.deleted),
      overShort: r(x.overShort),
      flagged: warned.has(x.staffName),
    }))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.sales - a.sales)
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warn' ? -1 : 1))
  return { from, to, staff, alerts }
}

/** Local midnight of a YYYY-MM-DD date. */
export const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime()

/** The end-of-day summary for the owner. */
export function dailySummary(
  date: string,
  orders: Order[],
  shifts: Shift[],
  audit: AuditEntry[],
  controls: StaffControls,
  decimals: number,
): DailySummary {
  const r = (n: number) => roundTo(n, decimals)
  const from = dayStart(date)
  const to = from + DAY
  const day = inRange(orders, from, to)
  const done = day.filter((o) => o.status === 'completed')
  const sales = done.reduce((s, o) => s + o.total, 0)
  const lastWeek = inRange(orders, from - 7 * DAY, to - 7 * DAY).filter(
    (o) => o.status === 'completed',
  )

  const pay: Record<PaymentMethod, number> = { cash: 0, card: 0, qr: 0 }
  const items = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const o of done) {
    pay.cash += netCash(o.payments, o.change)
    for (const p of o.payments) if (p.method !== 'cash') pay[p.method] += p.amount
    for (const l of o.lines) {
      const it = items.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 }
      it.qty += l.qty
      it.revenue += lineTotal(l)
      items.set(l.productId, it)
    }
  }

  const inDay = audit.filter((e) => e.at >= from && e.at < to)
  const total = (type: AuditEntry['type']) =>
    r(inDay.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0))
  const count = (type: AuditEntry['type']) => inDay.filter((e) => e.type === type).length
  const refunded = orders.filter((o) => o.refund && o.refund.at >= from && o.refund.at < to)

  return {
    date,
    sales: r(sales),
    orders: done.length,
    avg: r(done.length ? sales / done.length : 0),
    items: done.reduce((s, o) => s + o.itemCount, 0),
    lastWeek: { sales: r(lastWeek.reduce((s, o) => s + o.total, 0)), orders: lastWeek.length },
    payments: (Object.keys(pay) as PaymentMethod[])
      .filter((m) => pay[m] > 0)
      .map((method) => ({ method, amount: r(pay[method]) })),
    top: [...items.values()]
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .slice(0, 5)
      .map((i) => ({ ...i, revenue: r(i.revenue) })),
    shifts: shifts
      .filter((s) => s.openedAt < to && (s.closedAt ?? Infinity) >= from)
      .sort((a, b) => a.openedAt - b.openedAt)
      .map((s) => {
        const expected = s.expectedCash ?? shiftSummary(s, orders, decimals).expectedCash
        return {
          staffName: s.closedBy ?? s.openedBy,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          expected: r(expected),
          counted: s.countedCash,
          diff: s.countedCash === null ? null : r(s.countedCash - expected),
        }
      }),
    discounts: total('discount'),
    voids: { count: count('void'), value: total('void') },
    refunds: { count: refunded.length, value: r(refunded.reduce((s, o) => s + o.total, 0)) },
    cashOut: total('cashOut'),
    alerts: riskReport(orders, audit, from, to, controls, decimals).alerts,
  }
}
