// Automatic promotions, shared by the till (to show the price) and the server (which charges it).
// Only relative imports here: this module also runs inside the Vite config (Node).
import type { AppliedPromotion, OrderLine, Promotion } from '../types.ts'
import { lineTotal, roundTo } from './pos.ts'

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Whether a promotion runs at this moment, at this branch. */
export function promotionRunning(p: Promotion, at: Date, branchId?: string): boolean {
  if (!p.active) return false
  if (branchId && p.branchIds.length && !p.branchIds.includes(branchId)) return false
  if (p.days.length && !p.days.includes(at.getDay())) return false
  const day = ymd(at)
  if (p.dateFrom && day < p.dateFrom) return false
  if (p.dateTo && day > p.dateTo) return false
  if (p.timeFrom && p.timeTo) {
    const now = hhmm(at)
    // A window like 22:00–02:00 runs past midnight.
    const inWindow =
      p.timeFrom <= p.timeTo
        ? now >= p.timeFrom && now < p.timeTo
        : now >= p.timeFrom || now < p.timeTo
    if (!inWindow) return false
  }
  return true
}

const matches = (p: Promotion, l: OrderLine) =>
  (!p.productIds.length && !p.categoryIds.length) ||
  p.productIds.includes(l.productId) ||
  p.categoryIds.includes(l.categoryId)

/** Saving of an item promotion on some lines, per line index. */
function itemSavings(p: Promotion, lines: OrderLine[], idx: number[]): Map<number, number> {
  const out = new Map<number, number>()
  if (p.kind === 'percentOff') {
    for (const i of idx) out.set(i, (lineTotal(lines[i]!) * p.percent) / 100)
    return out
  }
  // Buy X get Y free: in every group of X + Y units, the cheapest Y are free.
  const units = idx
    .flatMap((i) => {
      const l = lines[i]!
      const each = lineTotal(l) / l.qty
      return Array.from({ length: l.qty }, () => ({ i, each }))
    })
    .sort((a, b) => b.each - a.each)
  const group = p.buyQty + p.getQty
  const free = Math.floor(units.length / group) * p.getQty
  for (const u of units.slice(units.length - free)) out.set(u.i, (out.get(u.i) ?? 0) + u.each)
  return out
}

/**
 * The promotions that apply to an order, and what each saves. Each item gets at most one item
 * promotion (the one that saves the most is used first); then the best "spend over" promotion
 * takes its percent off what is left.
 */
export function applyPromotions(
  lines: OrderLine[],
  promotions: Promotion[],
  at: Date,
  branchId: string | undefined,
  decimals: number,
): { applied: AppliedPromotion[]; total: number } {
  const r = (n: number) => roundTo(n, decimals)
  const running = promotions.filter((p) => promotionRunning(p, at, branchId))
  const applied: AppliedPromotion[] = []
  const taken = new Set<number>()

  let pending = running.filter((p) => p.kind !== 'spendOver')
  while (pending.length) {
    let best: { p: Promotion; savings: Map<number, number>; sum: number } | null = null
    for (const p of pending) {
      const idx = lines.map((_, i) => i).filter((i) => !taken.has(i) && matches(p, lines[i]!))
      const savings = itemSavings(p, lines, idx)
      const sum = [...savings.values()].reduce((a, b) => a + b, 0)
      if (!best || sum > best.sum) best = { p, savings, sum }
    }
    if (!best || r(best.sum) <= 0) break
    applied.push({ id: best.p.id, name: best.p.name, amount: r(best.sum) })
    for (const i of best.savings.keys()) taken.add(i)
    pending = pending.filter((p) => p !== best.p)
  }

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0)
  const itemTotal = applied.reduce((s, a) => s + a.amount, 0)
  const rest = subtotal - itemTotal
  const spend = running
    .filter((p) => p.kind === 'spendOver' && rest >= p.minSpend)
    .map((p) => ({ p, amount: r((rest * p.percent) / 100) }))
    .sort((a, b) => b.amount - a.amount)[0]
  if (spend && spend.amount > 0)
    applied.push({ id: spend.p.id, name: spend.p.name, amount: spend.amount })

  return { applied, total: r(applied.reduce((s, a) => s + a.amount, 0)) }
}
