// Contract tests for the mock API. A real backend should pass the same scenarios.
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, memoryAdapter, seedData } from '@/mock/db'
import { createApi } from '@/mock/router'
import type { CheckoutRequest, Order, Product, ShiftWithSummary } from '@/types'

let api: ReturnType<typeof createApi>
let token: string | null = null

function call<T = unknown>(method: string, path: string, body?: unknown, query = {}) {
  const res = api.handle({ method, path, query, body: body ?? null, token })
  return res as { status: number; body: T }
}

function login(pin = '1234') {
  const res = call<{ token: string }>('POST', '/auth/login', { pin })
  token = res.body.token
  return res
}

const CROISSANT = 'prd-19' // $2.75, stock tracked
const LATTE = 'prd-4' // $3.75, required Size and Temperature options

function sale(over: Partial<CheckoutRequest> = {}): CheckoutRequest {
  return {
    orderType: 'dine-in',
    table: '',
    note: '',
    customerId: null,
    orderDiscount: { type: 'percent', value: 0 },
    lines: [{ productId: CROISSANT, qty: 2, options: [], note: '', discountPct: 0 }],
    payments: [{ method: 'cash', amount: 10 }],
    ...over,
  }
}

beforeEach(() => {
  api = createApi(createDb(memoryAdapter()))
  token = null
})

describe('auth', () => {
  it('rejects requests without a session', () => {
    expect(call('GET', '/products').status).toBe(401)
  })

  it('logs in with a PIN and never returns PINs', () => {
    const res = login()
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ user: { name: 'Manager', role: 'admin' } })
    expect(JSON.stringify(call('GET', '/staff').body)).not.toContain('"pin"')
  })

  it('rejects a wrong PIN', () => {
    expect(call('POST', '/auth/login', { pin: '9999' }).status).toBe(401)
  })

  it('keeps manager-only endpoints from cashiers', () => {
    login('0000')
    expect(call('GET', '/reports/summary').status).toBe(403)
    expect(call('POST', '/products', { name: 'X' }).status).toBe(403)
    expect(call('GET', '/products').status).toBe(200)
  })

  it('serves settings before sign-in (for the lock screen)', () => {
    expect(call('GET', '/settings').status).toBe(200)
  })
})

describe('checkout', () => {
  beforeEach(() => {
    login()
    call('POST', '/shifts', { openingFloat: 100 })
  })

  it('requires an open shift', () => {
    call('POST', '/shifts/current/close', { countedCash: 100, note: '' })
    const res = call<{ error: { code: string } }>('POST', '/orders', sale())
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NO_OPEN_SHIFT')
  })

  it('prices the order on the server, deducts stock and returns change', () => {
    const before = call<Product>('GET', `/products/${CROISSANT}`).body.stock!
    const res = call<Order>('POST', '/orders', sale())
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ subtotal: 5.5, tax: 0.55, total: 6.05, change: 3.95 })
    expect(res.body.staffName).toBe('Manager')
    expect(call<Product>('GET', `/products/${CROISSANT}`).body.stock).toBe(before - 2)
  })

  it('ignores prices sent by the client', () => {
    const body = sale() as CheckoutRequest & { lines: { unitPrice?: number }[] }
    body.lines[0]!.unitPrice = 0.01
    expect(call<Order>('POST', '/orders', body).body.subtotal).toBe(5.5)
  })

  it('prices options and enforces required ones', () => {
    const missing = call(
      'POST',
      '/orders',
      sale({ lines: [{ productId: LATTE, qty: 1, options: [], note: '', discountPct: 0 }] }),
    )
    expect(missing.status).toBe(400)
    const ok = call<Order>(
      'POST',
      '/orders',
      sale({
        lines: [
          {
            productId: LATTE,
            qty: 1,
            options: [
              { group: 'Size', name: 'Large' },
              { group: 'Temperature', name: 'Iced' },
              { group: 'Extras', name: 'Extra shot' },
            ],
            note: '',
            discountPct: 0,
          },
        ],
      }),
    )
    expect(ok.status).toBe(201)
    expect(ok.body.lines[0]!.unitPrice).toBe(3.75 + 0.5 + 0.25 + 0.75)
  })

  it('does not charge twice when a request is retried with the same id', () => {
    const first = call<Order>('POST', '/orders', sale({ id: 'retry-1' }))
    const again = call<Order>('POST', '/orders', sale({ id: 'retry-1' }))
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.body.number).toBe(first.body.number)
  })

  it('rejects short payment and overpaid card payments', () => {
    expect(
      call('POST', '/orders', sale({ payments: [{ method: 'cash', amount: 1 }] })).status,
    ).toBe(400)
    expect(
      call('POST', '/orders', sale({ payments: [{ method: 'card', amount: 50 }] })).status,
    ).toBe(400)
  })

  it('rejects orders beyond the stock level and leaves data unchanged', () => {
    const before = call<Product>('GET', `/products/${CROISSANT}`).body.stock!
    const res = call<{ error: { code: string } }>(
      'POST',
      '/orders',
      sale({
        lines: [{ productId: CROISSANT, qty: before + 1, options: [], note: '', discountPct: 0 }],
        payments: [{ method: 'cash', amount: 999 }],
      }),
    )
    expect(res.body.error.code).toBe('OUT_OF_STOCK')
    expect(call<Product>('GET', `/products/${CROISSANT}`).body.stock).toBe(before)
  })

  it('awards loyalty points to the customer', () => {
    const order = call<Order>('POST', '/orders', sale({ customerId: 'cus-2' })).body
    expect(order.pointsEarned).toBe(6)
    const c = call<{ points: number; visits: number }>('GET', '/customers/cus-2').body
    expect(c).toMatchObject({ points: 18 + 6, visits: 10 })
  })
})

describe('refunds and the cash drawer', () => {
  it('tracks expected cash through sales, refunds and cash moves', () => {
    login()
    call('POST', '/shifts', { openingFloat: 100 })
    const order = call<Order>('POST', '/orders', sale()).body
    call('POST', '/shifts/current/cash-moves', { type: 'out', amount: 5, reason: 'Ice' })
    let cur = call<ShiftWithSummary>('GET', '/shifts/current').body
    expect(cur.summary.expectedCash).toBe(100 + 6.05 - 5)

    const refunded = call<Order>('POST', `/orders/${order.id}/refund`, {
      reason: 'Wrong item',
      restock: true,
    })
    expect(refunded.body.status).toBe('refunded')
    expect(call('POST', `/orders/${order.id}/refund`, {}).status).toBe(409)
    cur = call<ShiftWithSummary>('GET', '/shifts/current').body
    expect(cur.summary.expectedCash).toBe(95)

    const closed = call<ShiftWithSummary>('POST', '/shifts/current/close', {
      countedCash: 94,
      note: '',
    })
    expect(closed.body.shift).toMatchObject({ expectedCash: 95, countedCash: 94 })
    expect(call('GET', '/shifts/current').body).toBeNull()
  })
})

describe('catalog rules', () => {
  beforeEach(() => login())

  it('will not delete a category that still has products', () => {
    expect(call('DELETE', '/categories/cat-coffee').status).toBe(409)
  })

  it('validates products', () => {
    expect(call('POST', '/products', { name: '', categoryId: 'cat-food', price: 1 }).status).toBe(
      400,
    )
    const res = call<Product>('POST', '/products', {
      name: 'Iced Water',
      categoryId: 'cat-tea',
      price: 0.5,
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Iced Water', stock: null, active: true })
  })

  it('keeps at least one manager', () => {
    expect(call('PATCH', '/staff/staff-admin', { role: 'cashier' }).status).toBe(409)
  })
})

describe('reports and top sellers', () => {
  it('ranks top sellers from the seeded demo sales', () => {
    login()
    const top = call<{ product: Product; qty: number }[]>('GET', '/orders/top-sellers', undefined, {
      limit: '3',
    }).body
    expect(top).toHaveLength(3)
    expect(top[0]!.qty).toBeGreaterThanOrEqual(top[1]!.qty)
  })

  it('moves demo sales so the newest one is today', () => {
    const orders = seedData().orders
    const newest = Math.max(...orders.map((o) => o.createdAt))
    expect(new Date(newest).toDateString()).toBe(new Date().toDateString())
  })

  it('summarises a date range', () => {
    login()
    const res = call<{ orders: number; net: number }>('GET', '/reports/summary', undefined, {
      from: '0',
      to: String(Date.now() + 1),
    })
    expect(res.status).toBe(200)
    expect(res.body.orders).toBeGreaterThan(100)
  })
})

describe('errors', () => {
  it('returns 404 for unknown endpoints and 405 for wrong methods', () => {
    expect(call('GET', '/nope').status).toBe(404)
    expect(call('PUT', '/settings').status).toBe(405)
  })
})
