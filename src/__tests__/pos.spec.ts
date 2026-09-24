import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computeTotals, lineKey, netCash, quickCashAmounts } from '@/utils/pos'
import { rankProducts, useOrdersStore } from '@/stores/orders'
import { useCartStore } from '@/stores/cart'
import { useCatalogStore } from '@/stores/catalog'
import { useShiftStore } from '@/stores/shift'
import { useAuthStore } from '@/stores/auth'
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

describe('checkout flow', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    setActivePinia(createPinia())
  })

  it('merges identical items, records the order and deducts stock', () => {
    const auth = useAuthStore()
    auth.login('1234')
    const catalog = useCatalogStore()
    const cart = useCartStore()
    const orders = useOrdersStore()
    useShiftStore().open(100)

    const croissant = catalog.products.find((p) => p.name === 'Butter Croissant')!
    const before = croissant.stock!
    cart.add(croissant)
    cart.add(croissant)
    expect(cart.state.lines).toHaveLength(1)
    expect(cart.state.lines[0]!.qty).toBe(2)

    const next = orders.nextNumber
    const order = cart.checkout([{ method: 'cash', amount: 10 }])
    expect(order.number).toBe(next)
    expect(order.total).toBe(6.05)
    expect(order.change).toBe(3.95)
    expect(order.staffName).toBe('Manager')
    expect(croissant.stock).toBe(before - 2)
    expect(cart.isEmpty).toBe(true)

    const shift = useShiftStore()
    expect(shift.summary(shift.current!).expectedCash).toBe(106.05)

    orders.refund(order.id, 'test', true)
    expect(croissant.stock).toBe(before)
    expect(shift.summary(shift.current!).expectedCash).toBe(100)
  })

  it('holds and resumes orders', () => {
    const catalog = useCatalogStore()
    const cart = useCartStore()
    cart.add(catalog.products[0]!)
    cart.state.table = '5'
    cart.hold('Table 5')
    expect(cart.isEmpty).toBe(true)
    expect(cart.held).toHaveLength(1)
    cart.resume(cart.held[0]!.id)
    expect(cart.state.table).toBe('5')
    expect(cart.held).toHaveLength(0)
  })

  it('uses a stable key for the same options in any order', () => {
    const a = { group: 'Size', name: 'Large', price: 0.5 }
    const b = { group: 'Milk', name: 'Oat', price: 0.5 }
    expect(lineKey('p', [a, b])).toBe(lineKey('p', [b, a]))
  })
})
