// Mock implementation of the Sun POS REST API (docs/API.md).
// It is transport-agnostic: `handle()` takes a plain request object and returns
// a status and JSON body. The Vite dev server and the in-browser "local" mode
// both call it. A real backend should behave the same way.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type {
  BackupFile,
  BreakdownBy,
  Category,
  CheckoutRequest,
  Customer,
  DbData,
  HeldOrder,
  Order,
  OrderLine,
  OrderType,
  Payment,
  PaymentMethod,
  Product,
  Role,
  SelectedOption,
  Settings,
  Shift,
  Staff,
  StaffPublic,
  StockMove,
  Tint,
} from '../types.ts'
import { computeTotals, lineKey, roundTo } from '../utils/pos.ts'
import type { Db } from './db.ts'
import {
  breakdown,
  inRange,
  productSales,
  rankProducts,
  reportSummary,
  salesByTime,
  shiftSummary,
} from './logic.ts'

export interface ApiRequest {
  method: string
  /** Path below the API base, e.g. "/orders/abc/refund". */
  path: string
  query: Record<string, string>
  body: unknown
  token: string | null
}

export interface ApiResponse {
  status: number
  body: unknown
}

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type Access = 'public' | 'staff' | 'admin'

interface Ctx {
  params: Record<string, string>
  query: Record<string, string>
  body: Record<string, unknown>
  user: Staff | null
  token: string | null
}

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  access: Access
  handler: (ctx: Ctx) => unknown
}

const TINTS: Tint[] = ['sage', 'amber', 'rose', 'sky', 'lilac', 'sand']
const ORDER_TYPES: OrderType[] = ['dine-in', 'takeaway', 'delivery']
const METHODS: PaymentMethod[] = ['cash', 'card', 'qr']
const ROLES: Role[] = ['admin', 'cashier']

const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const bad = (message: string, code = 'VALIDATION_ERROR') => new HttpError(400, code, message)
const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`)
const conflict = (code: string, message: string) => new HttpError(409, code, message)

function str(v: unknown, field: string, opts: { required?: boolean; max?: number } = {}): string {
  if (v === undefined || v === null) {
    if (opts.required) throw bad(`${field} is required`)
    return ''
  }
  if (typeof v !== 'string') throw bad(`${field} must be a string`)
  const s = v.trim()
  if (opts.required && !s) throw bad(`${field} is required`)
  if (s.length > (opts.max ?? 500)) throw bad(`${field} is too long`)
  return s
}

function num(
  v: unknown,
  field: string,
  opts: { min?: number; max?: number; int?: boolean; fallback?: number } = {},
): number {
  if ((v === undefined || v === null || v === '') && opts.fallback !== undefined)
    return opts.fallback
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${field} must be a number`)
  if (opts.int && !Number.isInteger(n)) throw bad(`${field} must be a whole number`)
  if (opts.min !== undefined && n < opts.min) throw bad(`${field} must be at least ${opts.min}`)
  if (opts.max !== undefined && n > opts.max) throw bad(`${field} must be at most ${opts.max}`)
  return n
}

function oneOf<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  if (!allowed.includes(v as T)) throw bad(`${field} must be one of: ${allowed.join(', ')}`)
  return v as T
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(`${field} must be an object`)
  return v as Record<string, unknown>
}

function arr(v: unknown, field: string): unknown[] {
  if (!Array.isArray(v)) throw bad(`${field} must be an array`)
  return v
}

const pub = ({ pin: _pin, ...rest }: Staff): StaffPublic => {
  void _pin
  return rest
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export function createApi(db: Db) {
  const sessions = new Map<string, string>() // token -> staff id
  const routes: Route[] = []
  const d = () => db.data
  const round = (n: number) => roundTo(n, d().settings.decimals)

  function route(method: string, path: string, access: Access, handler: Route['handler']) {
    const keys: string[] = []
    const pattern = new RegExp(
      '^' + path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)')) + '/?$',
    )
    routes.push({ method, pattern, keys, access, handler })
  }

  const findProduct = (id: string) => d().products.find((p) => p.id === id)
  const findCustomer = (id: string) => d().customers.find((c) => c.id === id)
  const currentShift = () => d().shifts.find((s) => s.closedAt === null) ?? null
  const withSummary = (shift: Shift) => ({
    shift,
    summary: shiftSummary(shift, d().orders, d().settings.decimals),
  })
  const productMap = () => new Map(d().products.map((p) => [p.id, p]))

  function logStock(
    productId: string,
    delta: number,
    reason: string,
    by: string,
  ): StockMove | null {
    const p = findProduct(productId)
    if (!p || p.stock === null || delta === 0) return null
    p.stock += delta
    const move: StockMove = { id: uid('stk-'), at: Date.now(), productId, delta, reason, by }
    d().stockMoves.unshift(move)
    if (d().stockMoves.length > 5000) d().stockMoves.length = 5000
    return move
  }

  function range(q: Record<string, string>) {
    const from = num(q.from, 'from', { fallback: 0 })
    const to = num(q.to, 'to', { fallback: Number.MAX_SAFE_INTEGER })
    return { from, to }
  }

  // ----- Auth --------------------------------------------------------------

  route('POST', '/auth/login', 'public', ({ body }) => {
    const pin = str(body.pin, 'pin', { required: true })
    const user = d().staff.find((u) => u.pin === pin)
    if (!user) throw new HttpError(401, 'INVALID_PIN', 'Wrong PIN, try again')
    const token = uid('tok-') + Math.random().toString(36).slice(2)
    sessions.set(token, user.id)
    return { token, user: pub(user) }
  })

  route('POST', '/auth/logout', 'staff', ({ token }) => {
    if (token) sessions.delete(token)
    return null
  })

  route('GET', '/auth/me', 'staff', ({ user }) => pub(user!))

  // ----- Staff -------------------------------------------------------------

  const adminCount = () => d().staff.filter((u) => u.role === 'admin').length

  function checkPin(pin: string, exceptId?: string) {
    if (!/^\d{4,6}$/.test(pin)) throw bad('PIN must be 4–6 digits', 'INVALID_PIN_FORMAT')
    if (d().staff.some((u) => u.pin === pin && u.id !== exceptId))
      throw conflict('PIN_TAKEN', 'That PIN is already used')
  }

  route('GET', '/staff', 'admin', () => d().staff.map(pub))

  route('POST', '/staff', 'admin', ({ body }) => {
    const name = str(body.name, 'name', { required: true, max: 60 })
    const role = oneOf(body.role, 'role', ROLES)
    const pin = str(body.pin, 'pin', { required: true })
    checkPin(pin)
    const u: Staff = { id: uid('stf-'), name, role, pin }
    d().staff.push(u)
    return { __status: 201, value: pub(u) }
  })

  route('PATCH', '/staff/:id', 'admin', ({ params, body }) => {
    const u = d().staff.find((x) => x.id === params.id)
    if (!u) throw notFound('Staff member')
    const name = body.name === undefined ? u.name : str(body.name, 'name', { required: true })
    const role = body.role === undefined ? u.role : oneOf(body.role, 'role', ROLES)
    const pin = str(body.pin, 'pin')
    if (pin) checkPin(pin, u.id)
    if (u.role === 'admin' && role !== 'admin' && adminCount() <= 1)
      throw conflict('LAST_MANAGER', 'At least one manager is required')
    Object.assign(u, { name, role }, pin ? { pin } : {})
    return pub(u)
  })

  route('DELETE', '/staff/:id', 'admin', ({ params, user }) => {
    const u = d().staff.find((x) => x.id === params.id)
    if (!u) throw notFound('Staff member')
    if (u.id === user!.id) throw conflict('CANNOT_DELETE_SELF', 'You cannot remove yourself')
    if (u.role === 'admin' && adminCount() <= 1)
      throw conflict('LAST_MANAGER', 'At least one manager is required')
    d().staff = d().staff.filter((x) => x.id !== u.id)
    for (const [t, id] of sessions) if (id === u.id) sessions.delete(t)
    return null
  })

  // ----- Settings ----------------------------------------------------------

  route('GET', '/settings', 'public', () => d().settings)

  route('PATCH', '/settings', 'admin', ({ body }) => {
    const s = d().settings
    const next: Settings = { ...s }
    const text = [
      'storeName',
      'address',
      'phone',
      'receiptFooter',
      'taxLabel',
      'currency',
      'locale',
    ] as const
    for (const k of text) if (body[k] !== undefined) next[k] = str(body[k], k, { max: 200 })
    if (!next.storeName) throw bad('storeName is required')
    if (!/^[A-Z]{3}$/.test(next.currency)) throw bad('currency must be a 3-letter ISO code')
    if (body.decimals !== undefined)
      next.decimals = num(body.decimals, 'decimals', { min: 0, max: 4, int: true })
    if (body.taxRate !== undefined)
      next.taxRate = num(body.taxRate, 'taxRate', { min: 0, max: 100 })
    if (body.serviceRate !== undefined)
      next.serviceRate = num(body.serviceRate, 'serviceRate', { min: 0, max: 100 })
    if (body.pointsPerUnit !== undefined)
      next.pointsPerUnit = num(body.pointsPerUnit, 'pointsPerUnit', { min: 0 })
    if (body.topSellerDays !== undefined)
      next.topSellerDays = num(body.topSellerDays, 'topSellerDays', { min: 1, max: 365, int: true })
    d().settings = next
    return next
  })

  // ----- Categories --------------------------------------------------------

  route('GET', '/categories', 'staff', () => d().categories)

  route('POST', '/categories', 'admin', ({ body }) => {
    const c: Category = {
      id: uid('cat-'),
      name: str(body.name, 'name', { required: true, max: 40 }),
      tint: body.tint === undefined ? 'sage' : oneOf(body.tint, 'tint', TINTS),
    }
    d().categories.push(c)
    return { __status: 201, value: c }
  })

  route('PATCH', '/categories/:id', 'admin', ({ params, body }) => {
    const c = d().categories.find((x) => x.id === params.id)
    if (!c) throw notFound('Category')
    if (body.name !== undefined) c.name = str(body.name, 'name', { required: true, max: 40 })
    if (body.tint !== undefined) c.tint = oneOf(body.tint, 'tint', TINTS)
    return c
  })

  route('DELETE', '/categories/:id', 'admin', ({ params }) => {
    if (!d().categories.some((c) => c.id === params.id)) throw notFound('Category')
    if (d().products.some((p) => p.categoryId === params.id))
      throw conflict('CATEGORY_NOT_EMPTY', 'Move or delete the products in this category first')
    d().categories = d().categories.filter((c) => c.id !== params.id)
    return null
  })

  // ----- Products ----------------------------------------------------------

  function productFrom(body: Record<string, unknown>, base: Product): Product {
    const merged = { ...base, ...body }
    const categoryId = str(merged.categoryId, 'categoryId', { required: true })
    if (!d().categories.some((c) => c.id === categoryId)) throw bad('categoryId does not exist')
    const stock =
      merged.stock === null || merged.stock === undefined
        ? null
        : num(merged.stock, 'stock', { int: true })
    const options = arr(merged.options ?? [], 'options').map((g, gi) => {
      const group = obj(g, `options[${gi}]`)
      return {
        id: str(group.id, 'option id') || uid('opt-'),
        name: str(group.name, 'option group name', { required: true, max: 40 }),
        multiple: Boolean(group.multiple),
        required: Boolean(group.required),
        choices: arr(group.choices, 'choices').map((c, ci) => {
          const choice = obj(c, `choices[${ci}]`)
          return {
            name: str(choice.name, 'choice name', { required: true, max: 40 }),
            price: num(choice.price, 'choice price', { fallback: 0 }),
          }
        }),
      }
    })
    const sku = str(merged.sku, 'sku', { max: 40 })
    const barcode = str(merged.barcode, 'barcode', { max: 40 })
    if (barcode && d().products.some((p) => p.id !== base.id && p.barcode === barcode))
      throw conflict('BARCODE_TAKEN', 'Another product already uses that barcode')
    return {
      id: base.id,
      name: str(merged.name, 'name', { required: true, max: 80 }),
      categoryId,
      price: num(merged.price, 'price', { min: 0 }),
      cost: num(merged.cost, 'cost', { min: 0, fallback: 0 }),
      sku,
      barcode,
      emoji: str(merged.emoji, 'emoji', { max: 16 }) || '🍽️',
      stock,
      lowStockAt: num(merged.lowStockAt, 'lowStockAt', { min: 0, int: true, fallback: 5 }),
      active: merged.active === undefined ? true : Boolean(merged.active),
      options,
    }
  }

  route('GET', '/products', 'staff', ({ query }) => {
    const q = (query.q ?? '').toLowerCase()
    return d().products.filter(
      (p) =>
        (!query.categoryId || p.categoryId === query.categoryId) &&
        (query.active === undefined || String(p.active) === query.active) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.includes(q)),
    )
  })

  route('GET', '/products/lookup', 'staff', ({ query }) => {
    const code = str(query.code, 'code', { required: true }).toLowerCase()
    const p = d().products.find(
      (x) => x.active && (x.barcode.toLowerCase() === code || x.sku.toLowerCase() === code),
    )
    if (!p) throw notFound('Product')
    return p
  })

  route('GET', '/products/:id', 'staff', ({ params }) => {
    const p = findProduct(params.id!)
    if (!p) throw notFound('Product')
    return p
  })

  route('POST', '/products', 'admin', ({ body }) => {
    const blank: Product = {
      id: uid('prd-'),
      name: '',
      categoryId: '',
      price: 0,
      cost: 0,
      sku: `SKU-${String(d().products.length + 1).padStart(3, '0')}`,
      barcode: '',
      emoji: '🍽️',
      stock: null,
      lowStockAt: 5,
      active: true,
      options: [],
    }
    const { id: _ignored, ...rest } = body
    void _ignored
    const p = productFrom(rest, blank)
    d().products.push(p)
    return { __status: 201, value: p }
  })

  route('PATCH', '/products/:id', 'admin', ({ params, body }) => {
    const i = d().products.findIndex((p) => p.id === params.id)
    if (i < 0) throw notFound('Product')
    const { id: _ignored, ...rest } = body
    void _ignored
    const p = productFrom(rest, d().products[i]!)
    d().products[i] = p
    return p
  })

  route('DELETE', '/products/:id', 'admin', ({ params }) => {
    if (!findProduct(params.id!)) throw notFound('Product')
    d().products = d().products.filter((p) => p.id !== params.id)
    return null
  })

  // ----- Stock -------------------------------------------------------------

  route('GET', '/stock/low', 'staff', () =>
    d().products.filter((p) => p.active && p.stock !== null && p.stock <= p.lowStockAt),
  )

  route('POST', '/stock/adjustments', 'admin', ({ body, user }) => {
    const productId = str(body.productId, 'productId', { required: true })
    const delta = num(body.delta, 'delta', { int: true })
    if (delta === 0) throw bad('delta must not be 0')
    const p = findProduct(productId)
    if (!p) throw notFound('Product')
    if (p.stock === null)
      throw conflict('STOCK_NOT_TRACKED', 'Stock is not tracked for this product')
    const move = logStock(
      productId,
      delta,
      str(body.reason, 'reason', { max: 80 }) || 'Adjustment',
      user!.name,
    )
    return { product: p, move }
  })

  route('GET', '/stock/movements', 'admin', ({ query }) => {
    const limit = num(query.limit, 'limit', { min: 1, max: 1000, int: true, fallback: 50 })
    return d()
      .stockMoves.filter((m) => !query.productId || m.productId === query.productId)
      .slice(0, limit)
  })

  // ----- Orders ------------------------------------------------------------

  function buildLines(body: CheckoutRequest): OrderLine[] {
    const rawLines = arr(body.lines, 'lines')
    if (!rawLines.length) throw bad('An order needs at least one item', 'EMPTY_ORDER')
    const lines = rawLines.map((raw, i): OrderLine => {
      const l = obj(raw, `lines[${i}]`)
      const p = findProduct(str(l.productId, `lines[${i}].productId`, { required: true }))
      if (!p || !p.active) throw bad(`lines[${i}]: product is not available`, 'PRODUCT_UNAVAILABLE')
      const picked = arr(l.options ?? [], `lines[${i}].options`).map((o) => obj(o, 'option'))
      const options: SelectedOption[] = []
      for (const o of picked)
        if (!p.options.some((g) => g.name === o.group))
          throw bad(`${p.name}: unknown option group "${String(o.group)}"`, 'INVALID_OPTION')
      for (const g of p.options) {
        const chosen = picked.filter((o) => o.group === g.name)
        if (g.required && !chosen.length)
          throw bad(`${p.name}: choose a ${g.name}`, 'INVALID_OPTION')
        if (!g.multiple && chosen.length > 1)
          throw bad(`${p.name}: choose only one ${g.name}`, 'INVALID_OPTION')
        for (const o of chosen) {
          const c = g.choices.find((x) => x.name === o.name)
          if (!c)
            throw bad(`${p.name}: "${String(o.name)}" is not a ${g.name} choice`, 'INVALID_OPTION')
          options.push({ group: g.name, name: c.name, price: c.price })
        }
      }
      return {
        key: lineKey(p.id, options),
        productId: p.id,
        name: p.name,
        emoji: p.emoji,
        categoryId: p.categoryId,
        unitPrice: round(p.price + options.reduce((s, o) => s + o.price, 0)),
        qty: num(l.qty, `lines[${i}].qty`, { min: 1, max: 999, int: true }),
        options,
        note: str(l.note, `lines[${i}].note`, { max: 200 }),
        discountPct: num(l.discountPct, `lines[${i}].discountPct`, {
          min: 0,
          max: 100,
          fallback: 0,
        }),
      }
    })
    // Check stock for the whole order, not line by line.
    const need = new Map<string, number>()
    for (const l of lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.qty)
    for (const [id, qty] of need) {
      const p = findProduct(id)!
      if (p.stock !== null && qty > p.stock)
        throw conflict('OUT_OF_STOCK', `Only ${Math.max(p.stock, 0)} ${p.name} in stock`)
    }
    return lines
  }

  route('POST', '/orders', 'staff', ({ body: raw, user }) => {
    const body = raw as unknown as CheckoutRequest
    const id = str(body.id, 'id', { max: 64 })
    const existing = id ? d().orders.find((o) => o.id === id) : undefined
    if (existing) return { __status: 200, value: existing } // retried request: same order back

    const shift = currentShift()
    if (!shift) throw conflict('NO_OPEN_SHIFT', 'Open a shift before taking payment')
    const lines = buildLines(body)
    const discount = obj(body.orderDiscount ?? { type: 'percent', value: 0 }, 'orderDiscount')
    const orderDiscount = {
      type: oneOf(discount.type, 'orderDiscount.type', ['percent', 'amount'] as const),
      value: num(discount.value, 'orderDiscount.value', { min: 0 }),
    }
    const customerId = body.customerId ? str(body.customerId, 'customerId') : null
    const customer = customerId ? findCustomer(customerId) : undefined
    if (customerId && !customer) throw bad('customerId does not exist')

    const totals = computeTotals(lines, orderDiscount, d().settings)
    const payments: Payment[] = arr(body.payments, 'payments').map((p, i) => {
      const pay = obj(p, `payments[${i}]`)
      return {
        method: oneOf(pay.method, `payments[${i}].method`, METHODS),
        amount: round(num(pay.amount, `payments[${i}].amount`, { min: 0.000001 })),
      }
    })
    const tendered = round(payments.reduce((s, p) => s + p.amount, 0))
    const nonCash = payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + p.amount, 0)
    if (tendered < totals.total)
      throw bad(`Payment is short by ${round(totals.total - tendered)}`, 'INSUFFICIENT_PAYMENT')
    if (round(nonCash) > totals.total)
      throw bad('Card and QR payments cannot exceed the total', 'OVERPAID_NON_CASH')

    const order: Order = {
      ...totals,
      id: id || uid('ord-'),
      number: d().orders.reduce((m, o) => Math.max(m, o.number), 0) + 1,
      createdAt: Date.now(),
      lines,
      orderDiscount,
      orderType: oneOf(body.orderType ?? 'dine-in', 'orderType', ORDER_TYPES),
      table: str(body.table, 'table', { max: 20 }),
      note: str(body.note, 'note', { max: 500 }),
      customerId,
      payments,
      tendered,
      change: round(tendered - totals.total),
      staffId: user!.id,
      staffName: user!.name,
      shiftId: shift.id,
      status: 'completed',
      refund: null,
      pointsEarned: customer ? Math.floor(totals.total * d().settings.pointsPerUnit) : 0,
    }
    d().orders.unshift(order)
    for (const l of lines) logStock(l.productId, -l.qty, `Sale #${order.number}`, user!.name)
    if (customer) {
      customer.totalSpent = round(customer.totalSpent + order.total)
      customer.points += order.pointsEarned
      customer.visits++
    }
    return { __status: 201, value: order }
  })

  route('GET', '/orders', 'staff', ({ query }) => {
    const { from, to } = range(query)
    const q = (query.q ?? '').trim().toLowerCase()
    const limit = num(query.limit, 'limit', { min: 1, max: 500, int: true, fallback: 50 })
    const offset = num(query.offset, 'offset', { min: 0, int: true, fallback: 0 })
    const customerName = (o: Order) =>
      o.customerId ? (findCustomer(o.customerId)?.name ?? '').toLowerCase() : ''
    const items = d().orders.filter(
      (o) =>
        o.createdAt >= from &&
        o.createdAt < to &&
        (!query.status || o.status === query.status) &&
        (!query.customerId || o.customerId === query.customerId) &&
        (!q ||
          String(o.number) === q.replace('#', '') ||
          o.table.toLowerCase() === q ||
          customerName(o).includes(q) ||
          o.staffName.toLowerCase().includes(q) ||
          o.lines.some((l) => l.name.toLowerCase().includes(q))),
    )
    return { items: items.slice(offset, offset + limit), total: items.length }
  })

  route('GET', '/orders/top-sellers', 'staff', ({ query }) => {
    const days = num(query.days, 'days', { min: 1, max: 365, fallback: d().settings.topSellerDays })
    const limit = num(query.limit, 'limit', { min: 1, max: 50, int: true, fallback: 8 })
    return rankProducts(d().orders, productMap(), Date.now() - days * 86400000)
      .filter((t) => t.product.active)
      .slice(0, limit)
  })

  route('GET', '/orders/:id', 'staff', ({ params }) => {
    const o = d().orders.find((x) => x.id === params.id)
    if (!o) throw notFound('Order')
    return o
  })

  route('POST', '/orders/:id/refund', 'admin', ({ params, body, user }) => {
    const o = d().orders.find((x) => x.id === params.id)
    if (!o) throw notFound('Order')
    if (o.status !== 'completed')
      throw conflict('ALREADY_REFUNDED', 'This order is already refunded')
    o.status = 'refunded'
    o.refund = {
      at: Date.now(),
      by: user!.name,
      reason: str(body.reason, 'reason', { max: 200 }),
      shiftId: currentShift()?.id ?? null,
    }
    if (body.restock !== false)
      for (const l of o.lines) logStock(l.productId, l.qty, `Refund #${o.number}`, user!.name)
    const c = o.customerId ? findCustomer(o.customerId) : undefined
    if (c) {
      c.totalSpent = Math.max(0, round(c.totalSpent - o.total))
      c.points = Math.max(0, c.points - o.pointsEarned)
      c.visits = Math.max(0, c.visits - 1)
    }
    return o
  })

  // ----- Held orders -------------------------------------------------------

  route('GET', '/held-orders', 'staff', () => d().held)

  route('POST', '/held-orders', 'staff', ({ body }) => {
    const lines = arr(body.lines, 'lines') as OrderLine[]
    if (!lines.length) throw bad('A held order needs at least one item', 'EMPTY_ORDER')
    const h: HeldOrder = {
      id: uid('hld-'),
      heldAt: Date.now(),
      label: str(body.label, 'label', { max: 60 }) || `Order ${d().held.length + 1}`,
      lines,
      discount: (body.discount as HeldOrder['discount']) ?? { type: 'percent', value: 0 },
      orderType: oneOf(body.orderType ?? 'dine-in', 'orderType', ORDER_TYPES),
      table: str(body.table, 'table', { max: 20 }),
      note: str(body.note, 'note', { max: 500 }),
      customerId: body.customerId ? str(body.customerId, 'customerId') : null,
    }
    d().held.unshift(h)
    return { __status: 201, value: h }
  })

  route('DELETE', '/held-orders/:id', 'staff', ({ params }) => {
    const h = d().held.find((x) => x.id === params.id)
    if (!h) throw notFound('Held order')
    d().held = d().held.filter((x) => x.id !== params.id)
    return h
  })

  // ----- Customers ---------------------------------------------------------

  function customerFields(body: Record<string, unknown>, base?: Customer) {
    return {
      name: str(body.name ?? base?.name, 'name', { required: true, max: 80 }),
      phone: str(body.phone ?? base?.phone, 'phone', { max: 30 }),
      email: str(body.email ?? base?.email, 'email', { max: 120 }),
      note: str(body.note ?? base?.note, 'note', { max: 300 }),
    }
  }

  route('GET', '/customers', 'staff', ({ query }) => {
    const q = (query.q ?? '').trim().toLowerCase()
    if (!q) return d().customers
    const digits = q.replace(/\s/g, '')
    return d().customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, '').includes(digits) ||
        c.email.toLowerCase().includes(q),
    )
  })

  route('GET', '/customers/:id', 'staff', ({ params }) => {
    const c = findCustomer(params.id!)
    if (!c) throw notFound('Customer')
    return c
  })

  route('GET', '/customers/:id/orders', 'staff', ({ params, query }) => {
    if (!findCustomer(params.id!)) throw notFound('Customer')
    const limit = num(query.limit, 'limit', { min: 1, max: 200, int: true, fallback: 20 })
    return d()
      .orders.filter((o) => o.customerId === params.id)
      .slice(0, limit)
  })

  route('POST', '/customers', 'staff', ({ body }) => {
    const c: Customer = {
      id: uid('cus-'),
      ...customerFields(body),
      points: 0,
      totalSpent: 0,
      visits: 0,
      createdAt: Date.now(),
    }
    d().customers.unshift(c)
    return { __status: 201, value: c }
  })

  route('PATCH', '/customers/:id', 'staff', ({ params, body }) => {
    const c = findCustomer(params.id!)
    if (!c) throw notFound('Customer')
    Object.assign(c, customerFields(body, c))
    return c
  })

  route('DELETE', '/customers/:id', 'admin', ({ params }) => {
    if (!findCustomer(params.id!)) throw notFound('Customer')
    d().customers = d().customers.filter((c) => c.id !== params.id)
    return null
  })

  // ----- Shifts ------------------------------------------------------------

  route('GET', '/shifts/current', 'staff', () => {
    const s = currentShift()
    return s ? withSummary(s) : null
  })

  route('POST', '/shifts', 'staff', ({ body, user }) => {
    if (currentShift()) throw conflict('SHIFT_ALREADY_OPEN', 'A shift is already open')
    const s: Shift = {
      id: uid('sft-'),
      openedAt: Date.now(),
      openedBy: user!.name,
      openingFloat: round(num(body.openingFloat, 'openingFloat', { min: 0, fallback: 0 })),
      cashMoves: [],
      closedAt: null,
      closedBy: null,
      countedCash: null,
      expectedCash: null,
      note: '',
    }
    d().shifts.unshift(s)
    return { __status: 201, value: withSummary(s) }
  })

  route('POST', '/shifts/current/cash-moves', 'staff', ({ body, user }) => {
    const s = currentShift()
    if (!s) throw conflict('NO_OPEN_SHIFT', 'No shift is open')
    s.cashMoves.push({
      at: Date.now(),
      type: oneOf(body.type, 'type', ['in', 'out'] as const),
      amount: round(num(body.amount, 'amount', { min: 0.000001 })),
      reason: str(body.reason, 'reason', { max: 120 }),
      by: user!.name,
    })
    return withSummary(s)
  })

  route('POST', '/shifts/current/close', 'staff', ({ body, user }) => {
    const s = currentShift()
    if (!s) throw conflict('NO_OPEN_SHIFT', 'No shift is open')
    const summary = shiftSummary(s, d().orders, d().settings.decimals)
    s.expectedCash = summary.expectedCash
    s.countedCash = round(num(body.countedCash, 'countedCash', { min: 0 }))
    s.note = str(body.note, 'note', { max: 300 })
    s.closedBy = user!.name
    s.closedAt = Date.now()
    return { shift: s, summary }
  })

  route('GET', '/shifts', 'staff', ({ query }) => {
    const limit = num(query.limit, 'limit', { min: 1, max: 200, int: true, fallback: 30 })
    return d()
      .shifts.filter((s) => s.closedAt !== null)
      .slice(0, limit)
      .map(withSummary)
  })

  // ----- Reports -----------------------------------------------------------

  const reportOrders = (query: Record<string, string>) => {
    const { from, to } = range(query)
    return { from, to, orders: inRange(d().orders, from, to) }
  }

  route('GET', '/reports/summary', 'admin', ({ query }) =>
    reportSummary(reportOrders(query).orders, productMap(), d().settings.decimals),
  )

  route('GET', '/reports/sales-by-time', 'admin', ({ query }) => {
    const { from, to, orders } = reportOrders(query)
    const bucket = oneOf(query.bucket ?? 'day', 'bucket', ['hour', 'day'] as const)
    return salesByTime(orders, from, to, bucket, d().settings.decimals, query.tz || undefined)
  })

  route('GET', '/reports/products', 'admin', ({ query }) => {
    const limit = num(query.limit, 'limit', { min: 1, max: 500, int: true, fallback: 100 })
    return productSales(reportOrders(query).orders, d().settings.decimals).slice(0, limit)
  })

  route('GET', '/reports/breakdown', 'admin', ({ query }) => {
    const by = oneOf<BreakdownBy>(query.by, 'by', ['payment', 'category', 'orderType', 'staff'])
    const names = new Map(d().categories.map((c) => [c.id, c.name]))
    return breakdown(
      reportOrders(query).orders,
      by,
      (id) => names.get(id) ?? 'Other',
      d().settings.decimals,
    )
  })

  // ----- Backup and admin --------------------------------------------------

  route('GET', '/backup', 'admin', (): BackupFile => ({
    app: 'sun-pos',
    version: 2,
    at: Date.now(),
    data: d(),
  }))

  route('POST', '/backup', 'admin', ({ body }) => {
    if (body.app !== 'sun-pos') throw bad('This is not a Sun POS backup file', 'INVALID_BACKUP')
    const data = obj(body.data, 'data')
    // Version 1 backups (browser-only app) used "stock-moves" as a key.
    if (data['stock-moves'] && !data.stockMoves) data.stockMoves = data['stock-moves']
    const keys = [
      'staff',
      'categories',
      'products',
      'stockMoves',
      'customers',
      'orders',
      'shifts',
      'held',
    ] as const
    const next = { ...d() } as DbData
    for (const k of keys) if (data[k] !== undefined) (next[k] as unknown[]) = arr(data[k], k)
    if (data.settings) next.settings = { ...d().settings, ...obj(data.settings, 'settings') }
    if (!next.staff.some((u) => u.role === 'admin')) throw bad('The backup has no manager account')
    db.data = next
    return null
  })

  route('POST', '/admin/reset', 'admin', ({ body }) => {
    db.reset(oneOf(body.scope, 'scope', ['sales', 'demo', 'all'] as const))
    return null
  })

  // ----- Dispatcher --------------------------------------------------------

  function handle(req: ApiRequest): ApiResponse {
    const method = req.method.toUpperCase()
    const path = req.path.replace(/\/+$/, '') || '/'
    let pathMatched = false
    for (const r of routes) {
      const m = r.pattern.exec(path)
      if (!m) continue
      pathMatched = true
      if (r.method !== method) continue
      try {
        const staffId = req.token ? sessions.get(req.token) : undefined
        const user = staffId ? (d().staff.find((u) => u.id === staffId) ?? null) : null
        if (r.access !== 'public' && !user)
          throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again')
        if (r.access === 'admin' && user!.role !== 'admin')
          throw new HttpError(403, 'FORBIDDEN', 'Only managers can do this')
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]))
        const body =
          req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
        // Work on a copy so a failed request leaves the data untouched.
        const snapshot = method === 'GET' ? null : JSON.stringify(db.data)
        let result: unknown
        try {
          result = r.handler({ params, query: req.query, body, user, token: req.token })
        } catch (e) {
          if (snapshot) db.data = JSON.parse(snapshot) as DbData
          throw e
        }
        if (method !== 'GET') db.save()
        if (result && typeof result === 'object' && '__status' in result) {
          const { __status, value } = result as { __status: number; value: unknown }
          return { status: __status, body: value }
        }
        return result === null && method !== 'GET'
          ? { status: 204, body: null }
          : { status: 200, body: result }
      } catch (e) {
        if (e instanceof HttpError)
          return { status: e.status, body: { error: { code: e.code, message: e.message } } }
        const message = e instanceof Error ? e.message : String(e)
        return { status: 500, body: { error: { code: 'INTERNAL', message } } }
      }
    }
    return pathMatched
      ? {
          status: 405,
          body: { error: { code: 'METHOD_NOT_ALLOWED', message: `${method} is not allowed here` } },
        }
      : {
          status: 404,
          body: { error: { code: 'NOT_FOUND', message: `No endpoint ${method} ${path}` } },
        }
  }

  return { handle }
}
