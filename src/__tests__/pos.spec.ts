import { describe, expect, it } from 'vitest'
import { computeTotals, lineKey, netCash, quickCashAmounts } from '@/utils/pos'
import { rankProducts } from '@/mock/logic'
import { applyPromotions, promotionRunning } from '@/utils/promotions'
import type { Order, OrderLine, Promotion } from '@/types'

const line = (over: Partial<OrderLine> = {}): OrderLine => ({
  key: 'k',
  productId: 'p1',
  name: 'Latte',
  emoji: '☕',
  categoryId: 'c',
  unitPrice: 4,
  qty: 1,
  options: [],
  note: '',
  discountPct: 0,
  ...over,
})

describe('computeTotals', () => {
  const cfg = { taxRate: 10, serviceRate: 0, decimals: 2 }

  it('adds tax on the subtotal', () => {
    const t = computeTotals([line({ qty: 2 })], { type: 'percent', value: 0 }, cfg)
    expect(t).toMatchObject({ itemCount: 2, subtotal: 8, discount: 0, tax: 0.8, total: 8.8 })
  })

  it('applies line discount, then order discount, then service and tax', () => {
    const t = computeTotals(
      [line({ qty: 2, discountPct: 50 }), line({ unitPrice: 6 })],
      { type: 'percent', value: 10 },
      { taxRate: 10, serviceRate: 5, decimals: 2 },
    )
    // subtotal 4 + 6 = 10, -10% = 9, service 0.45, tax 0.945 -> 0.95
    expect(t).toMatchObject({ subtotal: 10, discount: 1, service: 0.45, tax: 0.95, total: 10.4 })
  })

  it('never discounts more than the subtotal', () => {
    const t = computeTotals([line()], { type: 'amount', value: 99 }, cfg)
    expect(t.discount).toBe(4)
    expect(t.total).toBe(0)
  })

  it('rounds to whole units for zero-decimal currencies', () => {
    const t = computeTotals(
      [line({ unitPrice: 25000 })],
      { type: 'percent', value: 0 },
      {
        taxRate: 7,
        serviceRate: 0,
        decimals: 0,
      },
    )
    expect(t.total).toBe(26750)
  })
})

describe('cash helpers', () => {
  it('nets change out of cash payments', () => {
    expect(
      netCash(
        [
          { method: 'cash', amount: 20 },
          { method: 'card', amount: 5 },
        ],
        3.5,
      ),
    ).toBe(16.5)
  })

  it('suggests exact and rounded-up note amounts', () => {
    expect(quickCashAmounts(13.2, 2)).toEqual([13.2, 14, 15, 20, 50])
  })
})

describe('rankProducts', () => {
  it('ranks by quantity and ignores refunded or old orders', () => {
    const products = new Map(['a', 'b'].map((id) => [id, { id, active: true } as never]))
    const mk = (lines: OrderLine[], over: Partial<Order> = {}) =>
      ({ lines, status: 'completed', createdAt: 1000, ...over }) as Order
    const ranked = rankProducts(
      [
        mk([line({ productId: 'a', qty: 1 }), line({ productId: 'b', qty: 3 })]),
        mk([line({ productId: 'a', qty: 5 })], { status: 'refunded' }),
        mk([line({ productId: 'a', qty: 9 })], { createdAt: 1 }),
      ],
      products,
      500,
    )
    expect(ranked.map((r) => [r.product.id, r.qty])).toEqual([
      ['b', 3],
      ['a', 1],
    ])
  })
})

describe('lineKey', () => {
  it('is the same for the same options in any order', () => {
    const a = { group: 'Size', name: 'Large', price: 0.5 }
    const b = { group: 'Milk', name: 'Oat', price: 0.5 }
    expect(lineKey('p', [a, b])).toBe(lineKey('p', [b, a]))
  })
})

describe('promotions', () => {
  const promo = (over: Partial<Promotion>): Promotion => ({
    id: 'p',
    name: 'Promo',
    active: true,
    kind: 'percentOff',
    percent: 20,
    buyQty: 0,
    getQty: 0,
    minSpend: 0,
    productIds: [],
    categoryIds: [],
    days: [],
    timeFrom: '',
    timeTo: '',
    dateFrom: '',
    dateTo: '',
    branchIds: [],
    ...over,
  })
  const at = (h: number, m = 0, day = 3) => new Date(2026, 8, 20 + day, h, m) // 23 Sep 2026 is a Wednesday
  const tea = line({ productId: 'tea', categoryId: 'cat-tea', unitPrice: 3, qty: 2 })
  const bun = (qty: number, price = 2) =>
    line({ productId: `bun${price}`, categoryId: 'cat-bakery', unitPrice: price, qty })

  it('runs on its days, times (also past midnight), dates and branches', () => {
    const happy = promo({ timeFrom: '14:00', timeTo: '17:00', days: [3] })
    expect(promotionRunning(happy, at(15), 'b1')).toBe(true)
    expect(promotionRunning(happy, at(17), 'b1')).toBe(false)
    expect(promotionRunning(happy, at(15, 0, 4), 'b1')).toBe(false)
    const late = promo({ timeFrom: '22:00', timeTo: '02:00' })
    expect(promotionRunning(late, at(23))).toBe(true)
    expect(promotionRunning(late, at(1))).toBe(true)
    expect(promotionRunning(late, at(12))).toBe(false)
    expect(promotionRunning(promo({ dateTo: '2026-09-22' }), at(10))).toBe(false)
    expect(promotionRunning(promo({ branchIds: ['b2'] }), at(10), 'b1')).toBe(false)
    expect(promotionRunning(promo({ active: false }), at(10))).toBe(false)
  })

  it('takes a percent off matching items only', () => {
    const r = applyPromotions(
      [tea, bun(1)],
      [promo({ categoryIds: ['cat-tea'] })],
      at(10),
      undefined,
      2,
    )
    expect(r).toEqual({ applied: [{ id: 'p', name: 'Promo', amount: 1.2 }], total: 1.2 })
  })

  it('gives the cheapest items free on buy X get Y', () => {
    const b2g1 = promo({ kind: 'buyXGetY', buyQty: 2, getQty: 1, categoryIds: ['cat-bakery'] })
    // 3 × $2 and 2 × $1: two groups of three are not complete, one is: the cheapest ($1) is free.
    expect(applyPromotions([bun(3, 2), bun(2, 1)], [b2g1], at(10), undefined, 2).total).toBe(1)
    expect(applyPromotions([bun(2)], [b2g1], at(10), undefined, 2).total).toBe(0)
  })

  it('uses one promotion per item (the best), then spend-over on the rest', () => {
    const small = promo({ id: 'small', percent: 10 })
    const big = promo({ id: 'big', percent: 30, categoryIds: ['cat-tea'] })
    const spend = promo({ id: 'spend', kind: 'spendOver', percent: 10, minSpend: 5 })
    const r = applyPromotions([tea, bun(1)], [small, big, spend], at(10), undefined, 2)
    // Tea $6: 30% = 1.80. Bun $2: 10% = 0.20. Left: 6 = 8 − 2 → 10% = 0.60.
    expect(r.applied).toEqual([
      { id: 'big', name: 'Promo', amount: 1.8 },
      { id: 'small', name: 'Promo', amount: 0.2 },
      { id: 'spend', name: 'Promo', amount: 0.6 },
    ])
  })

  it('comes off before the manual discount and tax', () => {
    const t = computeTotals(
      [tea],
      { type: 'percent', value: 10 },
      { taxRate: 10, serviceRate: 0, decimals: 2 },
      1,
    )
    // 6 − 1 promo = 5; −10% = 0.50; tax on 4.50 = 0.45.
    expect(t).toMatchObject({ subtotal: 6, promo: 1, discount: 0.5, tax: 0.45, total: 4.95 })
  })
})
