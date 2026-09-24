import { describe, expect, it } from 'vitest'
import { computeTotals, lineKey, netCash, quickCashAmounts } from '@/utils/pos'
import { rankProducts } from '@/mock/logic'
import type { Order, OrderLine } from '@/types'

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
