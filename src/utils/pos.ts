import type { Discount, OrderLine, Payment, SelectedOption, Totals } from '../types.ts'

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function roundTo(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

export function lineKey(productId: string, options: SelectedOption[]): string {
  const sig = options
    .map((o) => `${o.group}:${o.name}`)
    .sort()
    .join(',')
  return `${productId}|${sig}`
}

export function lineTotal(line: Pick<OrderLine, 'unitPrice' | 'qty' | 'discountPct'>): number {
  return line.unitPrice * line.qty * (1 - (line.discountPct || 0) / 100)
}

export interface RateConfig {
  taxRate: number
  serviceRate: number
  decimals: number
}

/**
 * Order totals. Line discounts apply first, then the order discount,
 * then the service charge; tax is charged on the discounted amount plus service.
 */
export function computeTotals(
  lines: OrderLine[],
  discount: Discount,
  cfg: RateConfig,
  /** Saved by promotions (see utils/promotions.ts); comes off before the manual discount. */
  promo = 0,
): Totals {
  const r = (n: number) => roundTo(n, cfg.decimals)
  const subtotal = r(lines.reduce((s, l) => s + lineTotal(l), 0))
  const promoted = r(Math.min(Math.max(promo, 0), subtotal))
  const base = subtotal - promoted
  const rawDiscount =
    discount.type === 'percent'
      ? (base * Math.min(Math.max(discount.value, 0), 100)) / 100
      : Math.min(Math.max(discount.value, 0), base)
  const disc = r(rawDiscount)
  const taxable = base - disc
  const service = r((taxable * cfg.serviceRate) / 100)
  const tax = r(((taxable + service) * cfg.taxRate) / 100)
  return {
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
    promo: promoted,
    discount: disc,
    service,
    tax,
    total: r(taxable + service + tax),
  }
}

/** Cash actually kept from an order: cash tendered minus change given. */
export function netCash(payments: Payment[], change: number): number {
  const cash = payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
  return Math.max(cash - change, 0)
}

/** Suggested quick cash amounts: exact, then the next round note values. */
export function quickCashAmounts(due: number, decimals: number): number[] {
  if (due <= 0) return []
  const steps = decimals > 0 ? [1, 5, 10, 20, 50, 100] : [1000, 5000, 10000, 20000, 50000, 100000]
  const out = new Set<number>([roundTo(due, decimals)])
  for (const s of steps) {
    const v = Math.ceil(due / s) * s
    if (v > due) out.add(v)
    if (out.size >= 5) break
  }
  return [...out].sort((a, b) => a - b)
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Deep copy of plain data (safe for Vue reactive proxies, unlike structuredClone). */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** A line with no note or discount, which can be added to an identical one. */
const plainLine = (l: OrderLine) => !l.note && !l.discountPct

/**
 * Adds lines from another bill: identical plain lines (same item and options) add up,
 * everything else is appended. Returns a new array; `newId` gives appended lines an id.
 */
export function mergeLines(
  into: OrderLine[],
  lines: OrderLine[],
  newId: () => string = uid,
): OrderLine[] {
  const out = into.map((l) => ({ ...l }))
  for (const line of lines) {
    const same = plainLine(line) ? out.find((l) => l.key === line.key && plainLine(l)) : undefined
    if (same) {
      same.qty += line.qty
      same.sentQty = (same.sentQty ?? 0) + (line.sentQty ?? 0)
    } else out.push({ ...line, id: newId() })
  }
  return out
}

/** The discount of combined bills: amounts add up; otherwise the first bill's discount wins. */
export function mergeDiscounts(discounts: Discount[]): Discount {
  const used = discounts.filter((d) => d.value > 0)
  if (used.length && used.every((d) => d.type === 'amount'))
    return { type: 'amount', value: used.reduce((s, d) => s + d.value, 0) }
  return used[0] ?? { type: 'percent', value: 0 }
}

/**
 * The whole discount as a percent of the items' full price (item discounts and the order
 * discount together). Used to check a cashier's discount limit, on the till and the server.
 */
export function discountPercent(lines: OrderLine[], discount: Discount, cfg: RateConfig): number {
  const gross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0)
  if (gross <= 0) return 0
  const t = computeTotals(lines, discount, cfg)
  return ((gross - t.subtotal + t.discount) / gross) * 100
}
