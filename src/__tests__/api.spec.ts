// Contract tests for the mock API. A real backend should pass the same scenarios.
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, memoryAdapter, seedData } from '@/mock/db'
import { createApi } from '@/mock/router'
import { localDate } from '@/utils/rates'
import type {
  Approval,
  AuditEntry,
  CheckoutRequest,
  DailySummary,
  OutboxEntry,
  Page,
  RiskReport,
  EffectiveRates,
  FloorPlan,
  HeldOrder,
  KitchenTicket,
  Order,
  Product,
  ShiftWithSummary,
} from '@/types'

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
    // Fixed evening time: early in the morning today's demo sales haven't "happened" yet.
    const now = new Date()
    now.setHours(22, 0, 0, 0)
    const orders = seedData(now.getTime()).orders
    const newest = Math.max(...orders.map((o) => o.createdAt))
    expect(new Date(newest).toDateString()).toBe(now.toDateString())
    expect(newest).toBeLessThanOrEqual(now.getTime())
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

describe('exchange rates', () => {
  const today = localDate()

  it('returns the latest rates on or before a day, for the store currency', () => {
    login()
    const res = call<EffectiveRates>('GET', '/exchange-rates', null, { date: today })
    expect(res.body).toMatchObject({ date: today, effectiveDate: today, base: 'USD' })
    const lak = res.body.rates.find((r) => r.currency === 'LAK')!
    expect(1 / lak.rate).toBeGreaterThan(20000)
    // A day before any rates were set has none.
    expect(
      call<EffectiveRates>('GET', '/exchange-rates', null, { date: '2000-01-01' }).body,
    ).toMatchObject({ effectiveDate: null, rates: [] })
  })

  it('lets managers set and delete a day, and checks the rates', () => {
    login()
    const put = (rates: unknown) => call('PUT', `/exchange-rates/${today}`, { rates })
    expect(put([{ currency: 'USD', rate: 1 }]).status).toBe(400) // the store currency
    expect(put([{ currency: 'LAK', rate: 0 }]).status).toBe(400)
    expect(put([]).status).toBe(400)
    expect(put([{ currency: 'LAK', rate: 1 / 22000 }]).status).toBe(200)
    const eff = call<EffectiveRates>('GET', '/exchange-rates').body
    expect(eff.rates).toEqual([{ currency: 'LAK', rate: 1 / 22000 }])

    expect(call('DELETE', `/exchange-rates/${today}`).status).toBe(204)
    // Falls back to the previous day's rates.
    expect(call<EffectiveRates>('GET', '/exchange-rates').body.effectiveDate).not.toBe(today)

    login('0000')
    expect(put([{ currency: 'LAK', rate: 1 / 22000 }]).status).toBe(403)
  })

  it('re-expresses rates when the store currency changes', () => {
    login()
    call('PATCH', '/settings', { currency: 'LAK', decimals: 0 })
    const eff = call<EffectiveRates>('GET', '/exchange-rates').body
    const usd = eff.rates.find((r) => r.currency === 'USD')!
    expect(eff.base).toBe('LAK')
    expect(usd.rate).toBeGreaterThan(20000) // 1 USD is worth ~21,850 LAK
  })

  it('saves the day’s rates with each sale, and the equal-split payments', () => {
    login()
    call('POST', '/shifts', { openingFloat: 0 })
    const res = call<Order>(
      'POST',
      '/orders',
      sale({
        splitWays: 2,
        payments: [
          { method: 'card', amount: 3.02, guest: 1 },
          { method: 'cash', amount: 5, guest: 2 },
        ],
      }),
    )
    expect(res.status).toBe(201)
    expect(res.body.exchangeRates).toMatchObject({ date: today, base: 'USD' })
    expect(res.body.splitWays).toBe(2)
    expect(res.body.payments.map((p) => p.guest)).toEqual([1, 2])
    expect(res.body.change).toBe(1.97)
    expect(call('POST', '/orders', sale({ splitWays: 1 })).status).toBe(400)
  })
})

describe('tables and kitchen tickets', () => {
  const RICE = 'prd-14' // Food → kitchen
  const ICED = 'prd-5' // Coffee → bar, requires a Size
  const held = (tableId: string, productId = CROISSANT) =>
    call<HeldOrder>('POST', '/held-orders', {
      label: '',
      lines: [{ key: productId, productId, name: 'x', qty: 1, options: [] }],
      tableId,
    })

  it('saves the floor plan, and keeps a table with an open bill', () => {
    login()
    const plan = call<FloorPlan>('GET', '/floor').body
    expect(plan.tables.length).toBeGreaterThan(0)
    const [first, second] = plan.tables
    const dup = {
      ...plan,
      tables: plan.tables.map((t) => (t === second ? { ...t, name: first!.name } : t)),
    }
    expect(call('PUT', '/floor', dup).status).toBe(400)

    // Moved off the plan's edge: kept inside it.
    const moved = { ...plan, tables: plan.tables.map((t) => (t === first ? { ...t, x: 5000 } : t)) }
    const saved = call<FloorPlan>('PUT', '/floor', moved).body
    expect(saved.tables[0]!.x).toBe(1000 - first!.w)

    expect(held(first!.id).status).toBe(201)
    const without = { ...plan, tables: plan.tables.slice(1) }
    expect(call('PUT', '/floor', without).body).toMatchObject({ error: { code: 'TABLE_IN_USE' } })
  })

  it('allows one bill per table; bills can move and merge', () => {
    login()
    const [a, b] = call<FloorPlan>('GET', '/floor').body.tables
    const billA = held(a!.id).body
    expect(held(a!.id).body).toMatchObject({ error: { code: 'TABLE_BUSY' } })
    const billB = held(b!.id).body
    expect(call('POST', `/held-orders/${billA.id}/move`, { tableId: b!.id }).status).toBe(409)

    const merged = call<HeldOrder>('POST', `/held-orders/${billB.id}/merge`, { ids: [billA.id] })
    expect(merged.body.lines[0]!.qty).toBe(2)
    expect(call<HeldOrder[]>('GET', '/held-orders').body).toHaveLength(1)
    call('POST', '/tickets', { tableId: b!.id, lines: [{ productId: RICE, qty: 1 }] })
    const moved = call<HeldOrder>('POST', `/held-orders/${billB.id}/move`, { tableId: a!.id })
    expect(moved.body).toMatchObject({ tableId: a!.id, table: a!.name })
    // The kitchen's ticket moved with the bill.
    expect(call<KitchenTicket[]>('GET', '/tickets').body[0]).toMatchObject({ tableId: a!.id })
  })

  it('sends one ticket per station and only for items that need making', () => {
    login()
    const res = call<KitchenTicket[]>('POST', '/tickets', {
      label: 'Table 1',
      lines: [
        { productId: RICE, qty: 2, options: ['Fried egg'], note: 'no chilli' },
        { productId: ICED, qty: 1, options: ['Large'], note: '' },
        { productId: CROISSANT, qty: 1, options: [], note: '' },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.map((t) => t.stationId).sort()).toEqual(['bar', 'kitchen'])
    const rice = res.body.find((t) => t.stationId === 'kitchen')!
    expect(rice.items).toMatchObject([{ qty: 2, options: ['Fried egg'], note: 'no chilli' }])

    call('PATCH', `/tickets/${rice.id}`, { item: 0, done: true })
    call('PATCH', `/tickets/${rice.id}`, { status: 'done' })
    const active = call<KitchenTicket[]>('GET', '/tickets').body
    expect(active.map((t) => t.stationId)).toEqual(['bar'])
    const done = call<KitchenTicket[]>('GET', '/tickets', null, { status: 'done' }).body
    expect(done[0]).toMatchObject({ id: rice.id, items: [{ done: true }] })
  })

  it('tickets unsent items on payment and closes the table bill', () => {
    login()
    call('POST', '/shifts', { openingFloat: 0 })
    const table = call<FloorPlan>('GET', '/floor').body.tables[0]!
    const bill = held(table.id, RICE).body
    const res = call<Order>(
      'POST',
      '/orders',
      sale({
        tableId: table.id,
        heldId: bill.id,
        lines: [
          { productId: RICE, qty: 3, options: [], note: '', discountPct: 0, sentQty: 1 },
          { productId: CROISSANT, qty: 1, options: [], note: '', discountPct: 0 },
        ],
        voids: [{ productId: RICE, qty: 1, options: [], note: '' }],
        payments: [{ method: 'cash', amount: 100 }],
      }),
    )
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ tableId: table.id, table: table.name })
    expect(call<HeldOrder[]>('GET', '/held-orders').body).toHaveLength(0)
    const [ticket] = call<KitchenTicket[]>('GET', '/tickets').body
    expect(ticket!.items).toMatchObject([
      { qty: 2, cancelled: false },
      { qty: 1, cancelled: true },
    ])
  })
})

describe('staff controls and the activity log', () => {
  const RICE = 'prd-14'
  const approval = (action: string, amount = 0, pin = '1234') =>
    call<Approval & { error?: { code: string } }>('POST', '/approvals', { pin, action, amount })
  const log = () => call<Page<AuditEntry>>('GET', '/audit').body.items

  function openShiftAsManager() {
    login()
    call('POST', '/shifts', { openingFloat: 100 })
  }

  it('needs a manager for a cashier discount above the limit', () => {
    openShiftAsManager()
    login('0000')
    const big = sale({
      orderDiscount: { type: 'percent', value: 20 },
      payments: [{ method: 'cash', amount: 10 }],
    })
    expect(call('POST', '/orders', big).body).toMatchObject({
      error: { code: 'APPROVAL_REQUIRED' },
    })
    // Within the 10% limit: fine without approval.
    const small = sale({ orderDiscount: { type: 'percent', value: 10 } })
    expect(call('POST', '/orders', small).status).toBe(201)

    // An approval for 15% doesn't cover 20%.
    expect(
      call('POST', '/orders', { ...big, discountApprovalId: approval('discount', 15).body.id })
        .status,
    ).toBe(403)
    const ok = approval('discount', 20).body.id
    expect(call('POST', '/orders', { ...big, discountApprovalId: ok }).status).toBe(201)
    // Each approval works once.
    expect(call('POST', '/orders', { ...big, id: 'again', discountApprovalId: ok }).status).toBe(
      403,
    )

    login()
    const discounts = log().filter((e) => e.type === 'discount')
    expect(discounts).toHaveLength(2)
    expect(discounts[0]).toMatchObject({ staffName: 'Cashier', approvedBy: 'Manager' })
  })

  it('logs wrong manager PINs and locks after five', () => {
    login('0000')
    for (let i = 0; i < 5; i++)
      expect(approval('refund', 0, '9999').body).toMatchObject({ error: { code: 'WRONG_PIN' } })
    expect(approval('refund', 0, '1234').status).toBe(429)
    login()
    expect(log().filter((e) => e.type === 'approvalFailed')).toHaveLength(5)
  })

  it('needs a manager to cancel sent items or delete a sent order', () => {
    openShiftAsManager()
    login('0000')
    const cancel = { productId: RICE, qty: 1, options: [], note: '', cancelled: true }
    expect(call('POST', '/tickets', { lines: [cancel] }).status).toBe(403)
    const id = approval('void').body.id
    expect(call('POST', '/tickets', { lines: [{ ...cancel, approvalId: id }] }).status).toBe(201)

    const bill = call<HeldOrder>('POST', '/held-orders', {
      label: 'T',
      lines: [{ key: RICE, productId: RICE, name: 'Rice', qty: 2, sentQty: 2, options: [] }],
    }).body
    expect(call('DELETE', `/held-orders/${bill.id}`).status).toBe(403)
    const del = approval('void').body.id
    expect(call('DELETE', `/held-orders/${bill.id}`, null, { approvalId: del }).status).toBe(200)

    login()
    const entries = log()
    expect(entries.find((e) => e.type === 'void')).toMatchObject({
      approvedBy: 'Manager',
      detail: '1 × Chicken Fried Rice',
    })
    expect(entries.find((e) => e.type === 'orderDeleted')).toMatchObject({
      staffName: 'Cashier',
      approvedBy: 'Manager',
    })
  })

  it('lets a cashier refund and take cash out only with a manager', () => {
    openShiftAsManager()
    const order = call<Order>('POST', '/orders', sale()).body
    login('0000')
    expect(call('POST', `/orders/${order.id}/refund`, { reason: 'Cold' }).status).toBe(403)
    const r = approval('refund').body.id
    expect(
      call('POST', `/orders/${order.id}/refund`, { reason: 'Cold', approvalId: r }).status,
    ).toBe(200)

    expect(call('POST', '/shifts/current/cash-moves', { type: 'out', amount: 5 }).status).toBe(403)
    expect(call('POST', '/shifts/current/cash-moves', { type: 'in', amount: 5 }).status).toBe(200)
    const c = approval('cashOut').body.id
    expect(
      call('POST', '/shifts/current/cash-moves', { type: 'out', amount: 5, approvalId: c }).status,
    ).toBe(200)
  })

  it('hides expected cash from cashiers (blind count) and flags a short drawer', () => {
    openShiftAsManager()
    call('POST', '/orders', sale()) // $6.05 cash, $3.95 change
    login('0000')
    const cur = call<ShiftWithSummary>('GET', '/shifts/current').body
    expect(cur.summary).toMatchObject({ blind: true, expectedCash: 0 })
    call('POST', '/shifts/current/close', { countedCash: 100, note: '' }) // 6.05 short

    login()
    const now = Date.now()
    const risk = call<RiskReport>('GET', '/reports/risk', null, {
      from: now - 3600000,
      to: now + 1,
    }).body
    expect(risk.alerts).toContainEqual(
      expect.objectContaining({
        code: 'cashShort',
        staffName: 'Cashier',
        amount: 6.05,
        level: 'warn',
      }),
    )
    expect(risk.staff.find((s) => s.staffName === 'Cashier')).toMatchObject({
      flagged: true,
      overShort: -6.05,
    })
  })

  it('builds the daily summary and queues it when a shift closes', () => {
    openShiftAsManager()
    call('POST', '/orders', sale())
    call('POST', '/shifts/current/close', { countedCash: 106.05, note: '' })
    const today = localDate()
    const s = call<DailySummary>('GET', '/reports/daily-summary', null, { date: today }).body
    expect(s).toMatchObject({ date: today })
    expect(s.orders).toBeGreaterThan(0)
    expect(s.shifts[s.shifts.length - 1]).toMatchObject({ staffName: 'Manager', diff: 0 })
    expect(s.top.length).toBeGreaterThan(0)

    const outbox = call<OutboxEntry[]>('GET', '/summary/outbox').body
    expect(outbox[0]).toMatchObject({ date: today, trigger: 'shiftClose', status: 'queued' })
    expect(call('POST', '/summary/send', { date: today }).status).toBe(201)

    login('0000')
    expect(call('GET', '/reports/daily-summary').status).toBe(403)
  })
})
