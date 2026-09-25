// Mock implementation of the Sun POS REST API (docs/API.md).
// It is transport-agnostic: `handle()` takes a plain request object and returns
// a status and JSON body. The Vite dev server and the in-browser "local" mode
// both call it. A real backend should behave the same way.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type {
  Approval,
  ApprovalAction,
  AuditEntry,
  AuditType,
  OutboxEntry,
  BackupFile,
  BreakdownBy,
  Category,
  CheckoutRequest,
  Customer,
  DbData,
  DiningTable,
  FloorArea,
  FloorPlan,
  KitchenTicket,
  Station,
  TableShape,
  TicketItem,
  TicketLineInput,
  TicketStatus,
  ExchangeRateSet,
  HeldOrder,
  Order,
  OrderLine,
  OrderType,
  Payment,
  PaymentMethod,
  Product,
  RateEntry,
  Role,
  SelectedOption,
  Settings,
  Shift,
  Staff,
  StaffPublic,
  StockMove,
  Tint,
} from '../types.ts'
import {
  computeTotals,
  discountPercent,
  lineKey,
  mergeDiscounts,
  mergeLines,
  roundTo,
} from '../utils/pos.ts'
import { effectiveRates, isDateKey, localDate } from '../utils/rates.ts'
import type { Db } from './db.ts'
import {
  dailySummary,
  riskReport,
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
const SHAPES: TableShape[] = ['square', 'round', 'rect']
const TICKET_STATUSES: TicketStatus[] = ['new', 'preparing', 'ready', 'done']
/** Size of the floor plan, in plan units. */
export const PLAN = { w: 1000, h: 640 } as const
const APPROVAL_ACTIONS: ApprovalAction[] = ['discount', 'void', 'refund', 'cashOut', 'reprint']
const LANGS = ['en', 'lo', 'zh', 'vi'] as const
/** Manager approvals are good for this long, and each can be used once. */
const APPROVAL_TTL = 30 * 60000
/** Wrong manager PINs allowed per till user before a short lock. */
const PIN_TRIES = 5

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
  const withSummary = (shift: Shift, user?: Staff | null) => {
    const summary = shiftSummary(shift, d().orders, d().settings.decimals)
    // Blind count: cashiers don't see what the drawer should hold.
    if (user && !isManager(user) && d().settings.controls.blindCount)
      return {
        shift: { ...shift, expectedCash: null },
        summary: {
          ...summary,
          cashSales: 0,
          cashRefunds: 0,
          expectedCash: 0,
          byMethod: { ...summary.byMethod, cash: 0 },
          blind: true,
        },
      }
    return { shift, summary }
  }
  const productMap = () => new Map(d().products.map((p) => [p.id, p]))

  // ----- Manager approvals and the activity log ---------------------------

  const approvals = new Map<string, Approval & { used: boolean }>()
  const pinFailures = new Map<string, number[]>() // staff id -> times of wrong manager PINs
  const isManager = (u: Staff) => u.role === 'admin'

  function audit(
    type: AuditType,
    user: Staff,
    e: Partial<Omit<AuditEntry, 'id' | 'at' | 'type' | 'staffId' | 'staffName'>> = {},
  ) {
    const entry: AuditEntry = {
      id: uid('aud-'),
      at: Date.now(),
      type,
      staffId: user.id,
      staffName: user.name,
      approvedBy: null,
      amount: 0,
      orderNumber: null,
      table: '',
      detail: '',
      ...e,
    }
    entry.amount = round(entry.amount)
    d().audit.unshift(entry)
    if (d().audit.length > 20000) d().audit.length = 20000
    return entry
  }

  /**
   * Checks a manager's approval for a cashier's action and uses it up. Managers approve their own
   * actions. Returns the approving manager's name, or throws 403 APPROVAL_REQUIRED.
   */
  function approve(user: Staff, action: ApprovalAction, id: unknown, amount = 0): string | null {
    if (isManager(user)) return null
    const a = typeof id === 'string' ? approvals.get(id) : undefined
    if (
      !a ||
      a.used ||
      a.action !== action ||
      Date.now() - a.at > APPROVAL_TTL ||
      a.amount + 0.01 < amount
    )
      throw new HttpError(403, 'APPROVAL_REQUIRED', 'A manager needs to approve this')
    a.used = true
    return a.managerName
  }

  route('POST', '/approvals', 'staff', ({ body, user }) => {
    const action = oneOf(body.action, 'action', APPROVAL_ACTIONS)
    const now = Date.now()
    const recent = (pinFailures.get(user!.id) ?? []).filter((t) => now - t < 5 * 60000)
    if (recent.length >= PIN_TRIES)
      throw new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong PINs. Wait a few minutes')
    const manager = d().staff.find((s) => s.role === 'admin' && s.pin === String(body.pin ?? ''))
    if (!manager) {
      pinFailures.set(user!.id, [...recent, now])
      audit('approvalFailed', user!, { detail: action })
      // Not thrown, so the failed attempt stays in the log.
      return {
        __status: 403,
        value: { error: { code: 'WRONG_PIN', message: 'That is not a manager PIN' } },
      }
    }
    const a: Approval = {
      id: uid('apr-'),
      action,
      managerName: manager.name,
      amount: num(body.amount, 'amount', { min: 0, fallback: 0 }),
      at: now,
    }
    approvals.set(a.id, { ...a, used: false })
    return { __status: 201, value: a }
  })

  /** Logs cancelled items (and checks their approvals). */
  function voidItems(
    items: TicketLineInput[],
    user: Staff,
    head: { table: string; orderNumber?: number | null },
  ) {
    const needs = d().settings.controls.approveVoids
    for (const v of items) {
      if (!v.cancelled || !(v.qty > 0)) continue
      const approvedBy = needs ? approve(user, 'void', v.approvalId) : null
      const p = findProduct(v.productId)
      audit('void', user, {
        approvedBy,
        amount: (p?.price ?? 0) * v.qty,
        table: head.table,
        orderNumber: head.orderNumber ?? null,
        detail: `${v.qty} × ${p?.name ?? v.productId}`,
      })
    }
  }

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
    if (body.receiptShowRates !== undefined) {
      if (typeof body.receiptShowRates !== 'boolean')
        throw bad('receiptShowRates must be true or false')
      next.receiptShowRates = body.receiptShowRates
    }
    if (body.controls !== undefined) {
      const c = obj(body.controls, 'controls')
      const bool = (k: string, fallback: boolean) => {
        if (c[k] === undefined) return fallback
        if (typeof c[k] !== 'boolean') throw bad(`controls.${k} must be true or false`)
        return c[k] as boolean
      }
      const cur = s.controls
      next.controls = {
        discountLimitPct: num(c.discountLimitPct, 'controls.discountLimitPct', {
          min: 0,
          max: 100,
          fallback: cur.discountLimitPct,
        }),
        approveVoids: bool('approveVoids', cur.approveVoids),
        approveCashOut: bool('approveCashOut', cur.approveCashOut),
        approveReprint: bool('approveReprint', cur.approveReprint),
        blindCount: bool('blindCount', cur.blindCount),
        cashTolerance: num(c.cashTolerance, 'controls.cashTolerance', {
          min: 0,
          fallback: cur.cashTolerance,
        }),
      }
    }
    if (body.dailySummary !== undefined) {
      const c = obj(body.dailySummary, 'dailySummary')
      const cur = s.dailySummary
      const time = c.time === undefined ? cur.time : str(c.time, 'dailySummary.time')
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw bad('dailySummary.time must be HH:MM')
      next.dailySummary = {
        enabled: c.enabled === undefined ? cur.enabled : c.enabled === true,
        sendAt:
          c.sendAt === undefined
            ? cur.sendAt
            : oneOf(c.sendAt, 'dailySummary.sendAt', ['shiftClose', 'time'] as const),
        time,
        language:
          c.language === undefined
            ? cur.language
            : oneOf(c.language, 'dailySummary.language', LANGS),
        telegram:
          c.telegram === undefined ? cur.telegram : str(c.telegram, 'telegram', { max: 300 }),
        whatsapp:
          c.whatsapp === undefined ? cur.whatsapp : str(c.whatsapp, 'whatsapp', { max: 300 }),
        email: c.email === undefined ? cur.email : str(c.email, 'email', { max: 300 }),
      }
    }
    d().settings = next
    return next
  })

  // ----- Exchange rates ----------------------------------------------------

  const ratesOn = (date: string) => effectiveRates(d().exchangeRates, d().settings.currency, date)

  function dateParam(v: string | undefined, field: string) {
    if (!v) return localDate()
    if (!isDateKey(v)) throw bad(`${field} must be a date like 2025-01-31`)
    return v
  }

  route('GET', '/exchange-rates', 'staff', ({ query }) => ratesOn(dateParam(query.date, 'date')))

  route('GET', '/exchange-rates/history', 'staff', ({ query }) => {
    const limit = num(query.limit, 'limit', { min: 1, max: 366, int: true, fallback: 30 })
    return [...d().exchangeRates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
  })

  route('PUT', '/exchange-rates/:date', 'admin', ({ params, body, user }) => {
    const date = dateParam(params.date, 'date')
    const base = d().settings.currency
    const seen = new Set<string>()
    const rates = arr(body.rates, 'rates').map((raw, i): RateEntry => {
      const r = obj(raw, `rates[${i}]`)
      const currency = str(r.currency, `rates[${i}].currency`, { required: true }).toUpperCase()
      if (!/^[A-Z]{3}$/.test(currency))
        throw bad(`rates[${i}].currency must be a 3-letter ISO code`)
      if (currency === base) throw bad(`rates[${i}]: ${base} is the store currency`)
      if (seen.has(currency)) throw bad(`rates[${i}]: ${currency} is listed twice`)
      seen.add(currency)
      const rate = num(r.rate, `rates[${i}].rate`)
      if (!(rate > 0)) throw bad(`rates[${i}].rate must be more than 0`)
      return { currency, rate }
    })
    if (!rates.length) throw bad('Add at least one rate')
    const set: ExchangeRateSet = { date, base, rates, updatedBy: user!.name, updatedAt: Date.now() }
    d().exchangeRates = [set, ...d().exchangeRates.filter((x) => x.date !== date)]
    return set
  })

  route('DELETE', '/exchange-rates/:date', 'admin', ({ params }) => {
    if (!d().exchangeRates.some((x) => x.date === params.date)) throw notFound('Exchange rates')
    d().exchangeRates = d().exchangeRates.filter((x) => x.date !== params.date)
    return null
  })

  // ----- Kitchen and bar stations -------------------------------------------

  function stationRef(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null
    const id = str(v, 'stationId')
    if (!d().stations.some((s) => s.id === id)) throw bad('stationId does not exist')
    return id
  }

  route('GET', '/stations', 'staff', () => d().stations)

  route('PUT', '/stations', 'admin', ({ body }) => {
    const seen = new Set<string>()
    const next = arr(body.stations, 'stations').map((raw, i): Station => {
      const s = obj(raw, `stations[${i}]`)
      const id = s.id ? str(s.id, `stations[${i}].id`, { max: 40 }) : uid('stn-')
      if (seen.has(id)) throw bad(`stations[${i}]: id is used twice`)
      seen.add(id)
      return { id, name: str(s.name, `stations[${i}].name`, { required: true, max: 30 }) }
    })
    // Categories sent to a removed station no longer print tickets.
    for (const c of d().categories) if (c.stationId && !seen.has(c.stationId)) c.stationId = null
    d().stations = next
    return next
  })

  // ----- Floor plan --------------------------------------------------------

  route('GET', '/floor', 'staff', () => d().floor)

  route('PUT', '/floor', 'admin', ({ body }) => {
    const areaIds = new Set<string>()
    const areas = arr(body.areas, 'areas').map((raw, i): FloorArea => {
      const a = obj(raw, `areas[${i}]`)
      const id = a.id ? str(a.id, `areas[${i}].id`, { max: 40 }) : uid('area-')
      if (areaIds.has(id)) throw bad(`areas[${i}]: id is used twice`)
      areaIds.add(id)
      return { id, name: str(a.name, `areas[${i}].name`, { required: true, max: 30 }) }
    })
    if (!areas.length) throw bad('Add at least one area')
    const ids = new Set<string>()
    const names = new Set<string>()
    const tables = arr(body.tables, 'tables').map((raw, i): DiningTable => {
      const tb = obj(raw, `tables[${i}]`)
      const f = (k: string) => `tables[${i}].${k}`
      const id = tb.id ? str(tb.id, f('id'), { max: 40 }) : uid('tbl-')
      if (ids.has(id)) throw bad(`${f('id')} is used twice`)
      ids.add(id)
      const name = str(tb.name, f('name'), { required: true, max: 12 })
      if (names.has(name.toLowerCase()))
        throw bad(`Two tables are called "${name}"`, 'DUPLICATE_TABLE_NAME')
      names.add(name.toLowerCase())
      const areaId = str(tb.areaId, f('areaId'), { required: true })
      if (!areaIds.has(areaId)) throw bad(`${f('areaId')} does not exist`)
      const w = Math.round(num(tb.w, f('w'), { min: 40, max: 600 }))
      const h = Math.round(num(tb.h, f('h'), { min: 40, max: 600 }))
      return {
        id,
        name,
        areaId,
        seats: num(tb.seats, f('seats'), { min: 1, max: 50, int: true }),
        shape: oneOf(tb.shape, f('shape'), SHAPES),
        w,
        h,
        x: Math.round(Math.min(Math.max(num(tb.x, f('x')), 0), PLAN.w - w)),
        y: Math.round(Math.min(Math.max(num(tb.y, f('y')), 0), PLAN.h - h)),
      }
    })
    const busy = d().held.find((hd) => hd.tableId && !ids.has(hd.tableId))
    if (busy)
      throw conflict('TABLE_IN_USE', `Table ${busy.table} has an open bill. Close or move it first`)
    const plan: FloorPlan = { areas, tables }
    d().floor = plan
    return plan
  })

  // ----- Kitchen tickets ---------------------------------------------------

  /** Creates one ticket per station for the items that need preparing. */
  function makeTickets(
    head: {
      label: string
      orderType: OrderType
      table: string
      tableId: string | null
      note: string
    },
    lines: TicketLineInput[],
    staffName: string,
  ): KitchenTicket[] {
    const byStation = new Map<string, TicketItem[]>()
    for (const l of lines) {
      if (!(l.qty > 0)) continue
      const p = findProduct(l.productId)
      const stationId = p && d().categories.find((c) => c.id === p.categoryId)?.stationId
      if (!p || !stationId || !d().stations.some((s) => s.id === stationId)) continue
      const items = byStation.get(stationId) ?? []
      items.push({
        name: p.name,
        emoji: p.emoji,
        qty: l.qty,
        options: l.options,
        note: l.note,
        cancelled: !!l.cancelled,
        done: false,
      })
      byStation.set(stationId, items)
    }
    const now = Date.now()
    let number = d().tickets.reduce((m, tk) => Math.max(m, tk.number), 0)
    const made = [...byStation].map(([stationId, items]): KitchenTicket => ({
      id: uid('tkt-'),
      number: ++number,
      stationId,
      createdAt: now,
      status: 'new',
      statusAt: now,
      ...head,
      staffName,
      items,
    }))
    d().tickets.unshift(...made)
    if (d().tickets.length > 2000) d().tickets.length = 2000
    return made
  }

  function ticketLines(v: unknown, field: string): TicketLineInput[] {
    return arr(v ?? [], field).map((raw, i) => {
      const l = obj(raw, `${field}[${i}]`)
      return {
        productId: str(l.productId, `${field}[${i}].productId`, { required: true }),
        qty: num(l.qty, `${field}[${i}].qty`, { min: 0, max: 999, int: true }),
        options: arr(l.options ?? [], `${field}[${i}].options`).map((o) => String(o)),
        note: str(l.note, `${field}[${i}].note`, { max: 200 }),
        cancelled: l.cancelled === true,
        approvalId: typeof l.approvalId === 'string' ? l.approvalId : null,
      }
    })
  }

  function orderHead(body: Record<string, unknown>) {
    const tableId = tableRef(body.tableId)
    return {
      label: str(body.label, 'label', { max: 60 }),
      orderType: oneOf(body.orderType ?? 'dine-in', 'orderType', ORDER_TYPES),
      table: tableId ? findTable(tableId)!.name : str(body.table, 'table', { max: 20 }),
      tableId,
      note: str(body.note, 'note', { max: 500 }),
    }
  }

  route('POST', '/tickets', 'staff', ({ body, user }) => {
    const head = orderHead(body)
    const lines = ticketLines(body.lines, 'lines')
    voidItems(lines, user!, head)
    const made = makeTickets(head, lines, user!.name)
    return { __status: 201, value: made }
  })

  route('GET', '/tickets', 'staff', ({ query }) => {
    const status = query.status ?? 'active'
    const list = d().tickets.filter(
      (tk) =>
        (!query.stationId || tk.stationId === query.stationId) &&
        (status === 'done' ? tk.status === 'done' : tk.status !== 'done'),
    )
    if (status === 'done') {
      const limit = num(query.limit, 'limit', { min: 1, max: 200, int: true, fallback: 20 })
      return list.sort((a, b) => b.statusAt - a.statusAt).slice(0, limit)
    }
    return list.sort((a, b) => a.createdAt - b.createdAt)
  })

  route('PATCH', '/tickets/:id', 'staff', ({ params, body }) => {
    const tk = d().tickets.find((x) => x.id === params.id)
    if (!tk) throw notFound('Ticket')
    if (body.item !== undefined) {
      const i = num(body.item, 'item', { min: 0, max: tk.items.length - 1, int: true })
      tk.items[i]!.done = body.done !== false
    }
    if (body.status !== undefined) {
      tk.status = oneOf(body.status, 'status', TICKET_STATUSES)
      tk.statusAt = Date.now()
    }
    return tk
  })

  // ----- Categories --------------------------------------------------------

  route('GET', '/categories', 'staff', () => d().categories)

  route('POST', '/categories', 'admin', ({ body }) => {
    const c: Category = {
      id: uid('cat-'),
      name: str(body.name, 'name', { required: true, max: 40 }),
      tint: body.tint === undefined ? 'sage' : oneOf(body.tint, 'tint', TINTS),
      stationId: stationRef(body.stationId),
    }
    d().categories.push(c)
    return { __status: 201, value: c }
  })

  route('PATCH', '/categories/:id', 'admin', ({ params, body }) => {
    const c = d().categories.find((x) => x.id === params.id)
    if (!c) throw notFound('Category')
    if (body.name !== undefined) c.name = str(body.name, 'name', { required: true, max: 40 })
    if (body.tint !== undefined) c.tint = oneOf(body.tint, 'tint', TINTS)
    if (body.stationId !== undefined) c.stationId = stationRef(body.stationId)
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
    // Discounts above the cashier's limit need a manager.
    const gross = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0)
    const discountValue = gross - totals.subtotal + totals.discount
    const discountPct = discountPercent(lines, orderDiscount, d().settings)
    const discountBy =
      discountPct > d().settings.controls.discountLimitPct + 0.01
        ? approve(user!, 'discount', body.discountApprovalId, discountPct)
        : null
    const splitWays =
      body.splitWays === undefined || body.splitWays === null
        ? undefined
        : num(body.splitWays, 'splitWays', { min: 2, max: 20, int: true })
    const payments: Payment[] = arr(body.payments, 'payments').map((p, i) => {
      const pay = obj(p, `payments[${i}]`)
      const payment: Payment = {
        method: oneOf(pay.method, `payments[${i}].method`, METHODS),
        amount: round(num(pay.amount, `payments[${i}].amount`, { min: 0.000001 })),
      }
      if (splitWays && pay.guest !== undefined)
        payment.guest = num(pay.guest, `payments[${i}].guest`, {
          min: 1,
          max: splitWays,
          int: true,
        })
      return payment
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
    // Keep the day's rates with the sale, so the receipt shows the rates it was paid at.
    const rates = ratesOn(localDate(order.createdAt))
    order.exchangeRates = rates.effectiveDate
      ? { date: rates.effectiveDate, base: rates.base, rates: rates.rates }
      : null
    if (splitWays) order.splitWays = splitWays
    const tableId = tableRef(body.tableId)
    if (tableId) {
      order.tableId = tableId
      order.table = findTable(tableId)!.name
    }
    d().orders.unshift(order)
    for (const l of lines) logStock(l.productId, -l.qty, `Sale #${order.number}`, user!.name)
    // The kitchen gets whatever wasn't sent before, and any cancellations still to report.
    const voids = ticketLines(body.voids, 'voids').map((v) => ({ ...v, cancelled: true }))
    voidItems(voids, user!, { table: order.table, orderNumber: order.number })
    const unsent = arr(body.lines, 'lines').map((raw, i) => {
      const sent = num(obj(raw, 'line').sentQty, `lines[${i}].sentQty`, { min: 0, fallback: 0 })
      const l = lines[i]!
      return {
        productId: l.productId,
        qty: Math.max(l.qty - sent, 0),
        options: l.options.map((o) => o.name),
        note: l.note,
      }
    })
    makeTickets(
      {
        label: `#${order.number}`,
        orderType: order.orderType,
        table: order.table,
        tableId,
        note: order.note,
      },
      [...unsent, ...voids],
      user!.name,
    )
    if (discountValue > 0.000001)
      audit('discount', user!, {
        approvedBy: discountBy,
        amount: discountValue,
        orderNumber: order.number,
        table: order.table,
        detail: `${Math.round(discountPct * 10) / 10}%`,
      })
    // Paying a table's bill closes it.
    if (body.heldId) d().held = d().held.filter((x) => x.id !== body.heldId)
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

  route('POST', '/orders/:id/reprint', 'staff', ({ params, body, user }) => {
    const o = d().orders.find((x) => x.id === params.id)
    if (!o) throw notFound('Order')
    const approvedBy = d().settings.controls.approveReprint
      ? approve(user!, 'reprint', body.approvalId)
      : null
    audit('reprint', user!, { approvedBy, amount: o.total, orderNumber: o.number, table: o.table })
    return o
  })

  // Managers refund; a cashier can too, with a manager's approval.
  route('POST', '/orders/:id/refund', 'staff', ({ params, body, user }) => {
    const o = d().orders.find((x) => x.id === params.id)
    if (!o) throw notFound('Order')
    if (o.status !== 'completed')
      throw conflict('ALREADY_REFUNDED', 'This order is already refunded')
    const approvedBy = approve(user!, 'refund', body.approvalId)
    audit('refund', user!, {
      approvedBy,
      amount: o.total,
      orderNumber: o.number,
      table: o.table,
      detail: str(body.reason, 'reason', { max: 200 }),
    })
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

  const findTable = (id: string) => d().floor.tables.find((tb) => tb.id === id)

  function tableRef(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null
    const id = str(v, 'tableId')
    if (!findTable(id)) throw bad('tableId does not exist')
    return id
  }

  /** A table holds one bill: a second one is merged or moved, not added. */
  function checkTableFree(tableId: string | null, exceptId?: string) {
    const other = tableId && d().held.find((x) => x.tableId === tableId && x.id !== exceptId)
    if (other) throw conflict('TABLE_BUSY', `Table ${other.table} already has an open bill`)
  }

  function heldFrom(body: Record<string, unknown>, base?: HeldOrder): HeldOrder {
    const lines = arr(body.lines, 'lines') as OrderLine[]
    if (!lines.length) throw bad('A held order needs at least one item', 'EMPTY_ORDER')
    const head = orderHead(body)
    checkTableFree(head.tableId, base?.id)
    const now = Date.now()
    return {
      id: base?.id ?? uid('hld-'),
      heldAt: base?.heldAt ?? now,
      updatedAt: now,
      ...head,
      label: head.label || base?.label || `Order ${d().held.length + 1}`,
      lines,
      voids: arr(body.voids ?? [], 'voids') as OrderLine[],
      discount: (body.discount as HeldOrder['discount']) ?? { type: 'percent', value: 0 },
      customerId: body.customerId ? str(body.customerId, 'customerId') : null,
    }
  }

  /** Open tickets follow their bill to another table, so "ready" shows at the right table. */
  function retargetTickets(
    fromTableId: string | null,
    to: { tableId: string | null; table: string },
  ) {
    if (!fromTableId) return
    for (const tk of d().tickets)
      if (tk.tableId === fromTableId && tk.status !== 'done') Object.assign(tk, to)
  }

  const findHeld = (id: string) => {
    const h = d().held.find((x) => x.id === id)
    if (!h) throw notFound('Held order')
    return h
  }

  route('GET', '/held-orders', 'staff', () => d().held)

  route('POST', '/held-orders', 'staff', ({ body }) => {
    const h = heldFrom(body)
    d().held.unshift(h)
    return { __status: 201, value: h }
  })

  route('PUT', '/held-orders/:id', 'staff', ({ params, body }) => {
    const base = findHeld(params.id!)
    const h = heldFrom(body, base)
    // Saved to another table (moved from the Sell screen): its tickets follow it.
    if (base.tableId !== h.tableId)
      retargetTickets(base.tableId, { tableId: h.tableId, table: h.table })
    d().held = d().held.map((x) => (x.id === h.id ? h : x))
    return h
  })

  route('POST', '/held-orders/:id/move', 'staff', ({ params, body }) => {
    const h = findHeld(params.id!)
    const tableId = tableRef(body.tableId)
    checkTableFree(tableId, h.id)
    retargetTickets(h.tableId, {
      tableId,
      table: tableId ? findTable(tableId)!.name : '',
    })
    h.tableId = tableId
    h.table = tableId ? findTable(tableId)!.name : ''
    if (tableId) h.orderType = 'dine-in'
    h.updatedAt = Date.now()
    return h
  })

  route('POST', '/held-orders/:id/merge', 'staff', ({ params, body }) => {
    const h = findHeld(params.id!)
    const ids = arr(body.ids, 'ids').map((v) => str(v, 'ids[]'))
    if (!ids.length || ids.includes(h.id)) throw bad('ids must list other held orders')
    const others = ids.map(findHeld)
    for (const o of others) {
      // Bills without a floor-plan table join their table names ("5 + 6").
      if (!h.tableId && o.table && !h.table.split(' + ').includes(o.table))
        h.table = [h.table, o.table].filter(Boolean).join(' + ').slice(0, 20)
      retargetTickets(o.tableId, { tableId: h.tableId, table: h.table })
      h.lines = mergeLines(h.lines, o.lines, () => uid())
      h.voids = [...h.voids, ...o.voids]
      h.customerId ??= o.customerId
      if (o.note) h.note = [h.note, o.note].filter(Boolean).join(' · ').slice(0, 500)
    }
    const disc = mergeDiscounts([h.discount, ...others.map((o) => o.discount)])
    h.discount = disc.type === 'amount' ? { ...disc, value: round(disc.value) } : disc
    h.updatedAt = Date.now()
    d().held = d().held.filter((x) => !ids.includes(x.id))
    return h
  })

  route('DELETE', '/held-orders/:id', 'staff', ({ params, query, user }) => {
    const h = findHeld(params.id!)
    logDeleted(user!, {
      total: computeTotals(h.lines, h.discount, d().settings).total,
      items: h.lines.map((l) => `${l.qty} × ${l.name}`).join(', '),
      table: h.table,
      sent: h.lines.some((l) => (l.sentQty ?? 0) > 0) || h.voids.length > 0,
      approvalId: query.approvalId,
    })
    d().held = d().held.filter((x) => x.id !== params.id)
    return h
  })

  /** Throwing away an order: logged, and it needs a manager if the kitchen already has it. */
  function logDeleted(
    user: Staff,
    o: { total: number; items: string; table: string; sent: boolean; approvalId: unknown },
  ) {
    const approvedBy =
      o.sent && d().settings.controls.approveVoids ? approve(user, 'void', o.approvalId) : null
    audit('orderDeleted', user, { approvedBy, amount: o.total, table: o.table, detail: o.items })
  }

  // An order cleared from the screen before it was saved or paid.
  route('POST', '/activity/cleared-order', 'staff', ({ body, user }) => {
    logDeleted(user!, {
      total: num(body.total, 'total', { min: 0 }),
      items: str(body.items, 'items', { max: 500 }),
      table: str(body.table, 'table', { max: 20 }),
      sent: body.sent === true,
      approvalId: body.approvalId,
    })
    return null
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

  route('GET', '/shifts/current', 'staff', ({ user }) => {
    const s = currentShift()
    return s ? withSummary(s, user) : null
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
    return { __status: 201, value: withSummary(s, user) }
  })

  route('POST', '/shifts/current/cash-moves', 'staff', ({ body, user }) => {
    const s = currentShift()
    if (!s) throw conflict('NO_OPEN_SHIFT', 'No shift is open')
    const type = oneOf(body.type, 'type', ['in', 'out'] as const)
    const amount = round(num(body.amount, 'amount', { min: 0.000001 }))
    const reason = str(body.reason, 'reason', { max: 120 })
    const approvedBy =
      type === 'out' && d().settings.controls.approveCashOut
        ? approve(user!, 'cashOut', body.approvalId)
        : null
    s.cashMoves.push({ at: Date.now(), type, amount, reason, by: user!.name })
    audit(type === 'out' ? 'cashOut' : 'cashIn', user!, { approvedBy, amount, detail: reason })
    return withSummary(s, user)
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
    audit('shiftClosed', user!, { amount: s.countedCash - s.expectedCash, detail: s.note })
    const ds = d().settings.dailySummary
    if (ds.enabled && ds.sendAt === 'shiftClose') queueSummary(localDate(s.closedAt), 'shiftClose')
    return withSummary(s, user)
  })

  route('GET', '/shifts', 'staff', ({ query, user }) => {
    const limit = num(query.limit, 'limit', { min: 1, max: 200, int: true, fallback: 30 })
    return d()
      .shifts.filter((s) => s.closedAt !== null)
      .slice(0, limit)
      .map((s) => withSummary(s, user))
  })

  // ----- Reports -----------------------------------------------------------

  const reportOrders = (query: Record<string, string>) => {
    const { from, to } = range(query)
    return { from, to, orders: inRange(d().orders, from, to) }
  }

  route('GET', '/reports/risk', 'admin', ({ query }) => {
    const { from, to } = range(query)
    const s = d().settings
    return riskReport(d().orders, d().audit, from, to, s.controls, s.decimals)
  })

  route('GET', '/audit', 'admin', ({ query }) => {
    const { from, to } = range(query)
    const limit = num(query.limit, 'limit', { min: 1, max: 500, int: true, fallback: 100 })
    const offset = num(query.offset, 'offset', { min: 0, int: true, fallback: 0 })
    const items = d().audit.filter(
      (e) =>
        e.at >= from &&
        e.at < to &&
        (!query.type || e.type === query.type) &&
        (!query.staff || e.staffName === query.staff),
    )
    return { items: items.slice(offset, offset + limit), total: items.length }
  })

  const summaryOf = (date: string) => {
    const s = d().settings
    return dailySummary(date, d().orders, d().shifts, d().audit, s.controls, s.decimals)
  }

  route('GET', '/reports/daily-summary', 'admin', ({ query }) =>
    summaryOf(dateParam(query.date, 'date')),
  )

  /** Queues the day's summary for the backend to send to the owner. */
  function queueSummary(date: string, trigger: OutboxEntry['trigger']): OutboxEntry {
    const ds = d().settings.dailySummary
    const channels = (['telegram', 'whatsapp', 'email'] as const).filter((c) => ds[c].trim())
    const entry: OutboxEntry = {
      id: uid('out-'),
      at: Date.now(),
      date,
      trigger,
      channels: [...channels],
      status: 'queued',
      summary: summaryOf(date),
    }
    d().outbox.unshift(entry)
    if (d().outbox.length > 200) d().outbox.length = 200
    return entry
  }

  route('GET', '/summary/outbox', 'admin', () => {
    // A scheduled summary is queued the first time anyone looks after its time (the mock has no
    // clock of its own; a real backend runs a scheduled job instead).
    const ds = d().settings.dailySummary
    const today = localDate()
    const [hh, mm] = ds.time.split(':').map(Number)
    const due = new Date()
    due.setHours(hh!, mm!, 0, 0)
    if (
      ds.enabled &&
      ds.sendAt === 'time' &&
      Date.now() >= due.getTime() &&
      !d().outbox.some((o) => o.date === today && o.trigger === 'time')
    ) {
      queueSummary(today, 'time')
      db.save()
    }
    return d().outbox.slice(0, 50)
  })

  route('POST', '/summary/send', 'admin', ({ body }) => ({
    __status: 201,
    value: queueSummary(dateParam(body.date as string | undefined, 'date'), 'manual'),
  }))

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

  // ----- Bulk import ---------------------------------------------------------
  // Rows come from spreadsheets, so values are parsed leniently. On update, blank
  // cells keep the current value. Invalid rows are reported and skipped; the rest
  // are saved. With dryRun, nothing is saved and the result is a preview.

  /** Cell as trimmed text ('' for empty). */
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

  /** Number from a cell: accepts "1,250.50", "1.250,50", "$3.75", "25 000". undefined if blank. */
  function cellNum(v: unknown, field: string, opts: { min?: number; int?: boolean } = {}) {
    if (typeof v === 'number') return num(v, field, opts)
    let t = text(v).replace(/[^\d.,-]/g, '')
    if (!t) {
      if (text(v)) throw bad(`${field} must be a number`)
      return undefined
    }
    const comma = t.lastIndexOf(',')
    const dot = t.lastIndexOf('.')
    if (comma > -1 && dot > -1)
      t = comma > dot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
    else if (comma > -1)
      t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
    return num(t, field, opts)
  }

  /** Yes/no from a cell: yes, no, true, false, 1, 0, y, n, active, hidden. undefined if blank. */
  function cellBool(v: unknown, field: string) {
    if (typeof v === 'boolean') return v
    const t = text(v).toLowerCase()
    if (!t) return undefined
    if (['yes', 'y', 'true', '1', 'active', 'on', 'show', 'visible', 'available'].includes(t))
      return true
    if (['no', 'n', 'false', '0', 'inactive', 'off', 'hide', 'hidden', 'unavailable'].includes(t))
      return false
    throw bad(`${field} must be yes or no`)
  }

  /** Copy only the fields that have a value. */
  function defined<T extends object>(o: T): Partial<T> {
    return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
  }

  type RowOutcome = { action: 'create' | 'update' | 'skip'; label: string; message?: string }

  function runImport(
    body: Record<string, unknown>,
    handleRow: (row: Record<string, unknown>) => RowOutcome,
  ) {
    const rows = arr(body.rows, 'rows')
    if (!rows.length) throw bad('There are no rows to import')
    if (rows.length > 5000) throw bad('Import at most 5,000 rows at a time')
    const dryRun = body.dryRun === true
    const snapshot = dryRun ? JSON.stringify(db.data) : null
    const results = rows.map((raw, index) => {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      const fallbackLabel = text(row.name) || text(row.code) || `Row ${index + 1}`
      try {
        const r = handleRow(row)
        return { index, action: r.action, label: r.label, message: r.message ?? '' }
      } catch (e) {
        if (!(e instanceof HttpError)) throw e
        return { index, action: 'error' as const, label: fallbackLabel, message: e.message }
      }
    })
    if (snapshot) db.data = JSON.parse(snapshot) as DbData
    const count = (a: string) => results.filter((r) => r.action === a).length
    return {
      dryRun,
      created: count('create'),
      updated: count('update'),
      skipped: count('skip'),
      failed: count('error'),
      rows: results,
    }
  }

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  route('POST', '/import/products', 'admin', ({ body }) =>
    runImport(body, (row) => {
      const name = text(row.name)
      const sku = text(row.sku).toLowerCase()
      const barcode = text(row.barcode)
      const existing =
        (sku && d().products.find((p) => p.sku.toLowerCase() === sku)) ||
        (barcode && d().products.find((p) => p.barcode === barcode)) ||
        (name && d().products.find((p) => p.name.toLowerCase() === name.toLowerCase())) ||
        undefined
      if (!existing) {
        if (!name) throw bad('Name is required')
        if (!text(row.category)) throw bad('Category is required')
        if (!text(row.price)) throw bad('Price is required')
      }

      // Category by name (or id). A new name creates the category.
      let message = ''
      let createdCategory: Category | null = null
      const catText = text(row.category)
      let categoryId = existing?.categoryId ?? ''
      if (catText) {
        const cat = d().categories.find(
          (c) => c.id === catText || c.name.toLowerCase() === catText.toLowerCase(),
        )
        if (cat) categoryId = cat.id
        else {
          createdCategory = {
            id: uid('cat-'),
            name: catText.slice(0, 40),
            tint: TINTS[d().categories.length % TINTS.length]!,
            stationId: null,
          }
          d().categories.push(createdCategory)
          categoryId = createdCategory.id
          message = `New category: ${createdCategory.name}`
        }
      }

      try {
        const stock = cellNum(row.stock, 'Stock', { int: true })
        const patch = defined({
          name: name || undefined,
          categoryId: categoryId || undefined,
          price: cellNum(row.price, 'Price', { min: 0 }),
          cost: cellNum(row.cost, 'Cost', { min: 0 }),
          sku: text(row.sku) || undefined,
          barcode: barcode || undefined,
          emoji: text(row.emoji) || undefined,
          lowStockAt: cellNum(row.lowStockAt, 'Low stock alert', { min: 0, int: true }),
          active: cellBool(row.active, 'Active'),
        })
        if (existing) {
          // Stock changes go through the movement log.
          const next = productFrom(patch, existing)
          const delta = stock !== undefined ? stock - (existing.stock ?? 0) : 0
          if (stock !== undefined && existing.stock === null) next.stock = 0
          else next.stock = existing.stock
          const changed =
            !same(next, existing) || delta !== 0 || (stock !== undefined && existing.stock === null)
          if (!changed)
            return { action: 'skip', label: existing.name, message: 'Already up to date' }
          d().products[d().products.indexOf(existing)] = next
          if (stock !== undefined && delta !== 0) logStock(next.id, delta, 'Import', 'Import')
          return { action: 'update', label: next.name, message }
        }
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
        const p = productFrom({ ...patch, stock: stock ?? null }, blank)
        d().products.push(p)
        return { action: 'create', label: p.name, message }
      } catch (e) {
        if (createdCategory) d().categories = d().categories.filter((c) => c !== createdCategory)
        throw e
      }
    }),
  )

  route('POST', '/import/customers', 'admin', ({ body }) =>
    runImport(body, (row) => {
      const phone = text(row.phone)
      const email = text(row.email).toLowerCase()
      const digits = phone.replace(/\D/g, '')
      const existing =
        (digits && d().customers.find((c) => c.phone.replace(/\D/g, '') === digits)) ||
        (email && d().customers.find((c) => c.email.toLowerCase() === email)) ||
        undefined
      const fields = customerFields(
        defined({
          name: text(row.name) || undefined,
          phone: phone || undefined,
          email: text(row.email) || undefined,
          note: text(row.note) || undefined,
        }),
        existing,
      )
      if (fields.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fields.email))
        throw bad('Email address is not valid')
      const points = cellNum(row.points, 'Points', { min: 0, int: true })
      if (existing) {
        const next = { ...existing, ...fields, ...(points !== undefined ? { points } : {}) }
        if (same(next, existing))
          return { action: 'skip', label: existing.name, message: 'Already up to date' }
        Object.assign(existing, next)
        return { action: 'update', label: existing.name }
      }
      const c: Customer = {
        id: uid('cus-'),
        ...fields,
        points: points ?? 0,
        totalSpent: 0,
        visits: 0,
        createdAt: Date.now(),
      }
      d().customers.unshift(c)
      return { action: 'create', label: c.name }
    }),
  )

  function roleFrom(v: unknown): Role | undefined {
    const t = text(v).toLowerCase()
    if (!t) return undefined
    if (['admin', 'manager', 'owner', 'supervisor'].includes(t)) return 'admin'
    if (['cashier', 'staff', 'employee', 'waiter', 'server', 'barista'].includes(t))
      return 'cashier'
    throw bad('Role must be Manager or Cashier')
  }

  function pinFrom(v: unknown): string | undefined {
    const pin = text(v)
    if (!pin) return undefined
    if (!/^\d{4,6}$/.test(pin))
      throw bad(
        typeof v === 'number' && pin.length < 4
          ? 'PIN must be 4–6 digits. In Excel, format the PIN column as Text to keep leading zeros.'
          : 'PIN must be 4–6 digits',
        'INVALID_PIN_FORMAT',
      )
    return pin
  }

  route('POST', '/import/staff', 'admin', ({ body }) =>
    runImport(body, (row) => {
      const name = str(row.name === undefined ? undefined : text(row.name), 'Name', {
        required: true,
        max: 60,
      })
      const role = roleFrom(row.role)
      const pin = pinFrom(row.pin)
      const existing = d().staff.find((u) => u.name.toLowerCase() === name.toLowerCase())
      if (pin) checkPin(pin, existing?.id)
      if (existing) {
        const nextRole = role ?? existing.role
        if (existing.role === 'admin' && nextRole !== 'admin' && adminCount() <= 1)
          throw conflict('LAST_MANAGER', 'At least one manager is required')
        const next = { ...existing, role: nextRole, ...(pin ? { pin } : {}) }
        if (same(next, existing))
          return { action: 'skip', label: existing.name, message: 'Already up to date' }
        Object.assign(existing, next)
        return { action: 'update', label: existing.name, message: pin ? 'PIN changed' : '' }
      }
      if (!pin) throw bad('PIN is required for new staff')
      d().staff.push({ id: uid('stf-'), name, role: role ?? 'cashier', pin })
      return { action: 'create', label: name }
    }),
  )

  route('POST', '/import/stock', 'admin', ({ body }) =>
    runImport(body, (row) => {
      const code = text(row.code).toLowerCase()
      if (!code) throw bad('SKU or barcode is required')
      const p = d().products.find(
        (x) => x.sku.toLowerCase() === code || x.barcode.toLowerCase() === code,
      )
      if (!p) throw bad(`No product with SKU or barcode "${text(row.code)}"`, 'NOT_FOUND')
      const qty = cellNum(row.quantity, 'Quantity', { int: true })
      if (qty === undefined) throw bad('Quantity is required')
      const reason = text(row.reason).slice(0, 80) || 'Stock count (import)'
      if (p.stock === null) {
        p.stock = 0
        logStock(p.id, qty, reason, 'Import')
        return { action: 'update', label: p.name, message: `Starts tracking stock: ${qty}` }
      }
      const delta = qty - p.stock
      if (delta === 0) return { action: 'skip', label: p.name, message: `Already ${qty}` }
      const before = p.stock
      logStock(p.id, delta, reason, 'Import')
      return { action: 'update', label: p.name, message: `${before} → ${qty}` }
    }),
  )

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
      'exchangeRates',
      'stations',
      'tickets',
      'audit',
      'outbox',
    ] as const
    const next = { ...d() } as DbData
    for (const k of keys) if (data[k] !== undefined) (next[k] as unknown[]) = arr(data[k], k)
    if (data.floor) next.floor = obj(data.floor, 'floor') as unknown as FloorPlan
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
