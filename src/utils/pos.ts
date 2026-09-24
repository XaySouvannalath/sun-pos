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
export function computeTotals(lines: OrderLine[], discount: Discount, cfg: RateConfig): Totals {
  const r = (n: number) => roundTo(n, cfg.decimals)
  const subtotal = r(lines.reduce((s, l) => s + lineTotal(l), 0))
  const rawDiscount =
    discount.type === 'percent'
      ? (subtotal * Math.min(Math.max(discount.value, 0), 100)) / 100
      : Math.min(Math.max(discount.value, 0), subtotal)
  const disc = r(rawDiscount)
  const taxable = subtotal - disc
  const service = r((taxable * cfg.serviceRate) / 100)
  const tax = r(((taxable + service) * cfg.taxRate) / 100)
  return {
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    subtotal,
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
