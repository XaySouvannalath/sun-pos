// Typed functions for every Sun POS endpoint. See docs/API.md for details.
import type {
  DiningTable,
  GuestOrder,
  PublicMenu,
  SelfOrder,
  SelfOrderRequest,
  SelfOrderStatus,
  TimeEntry,
  Timesheet,
  Promotion,
  Branch,
  Approval,
  ApprovalAction,
  AuditEntry,
  AuditType,
  DailySummary,
  OutboxEntry,
  RiskReport,
  BackupFile,
  BreakdownBy,
  BreakdownRow,
  Category,
  CheckoutRequest,
  Customer,
  CustomerInput,
  EffectiveRates,
  ExchangeRateSet,
  FloorPlan,
  KitchenTicket,
  Station,
  TicketRequest,
  TicketStatus,
  HeldOrder,
  ImportKind,
  ImportRequest,
  ImportResult,
  HeldOrderInput,
  LoginResponse,
  Order,
  Page,
  Product,
  ProductSales,
  RateEntry,
  ReportSummary,
  ResetScope,
  SalesBucket,
  Settings,
  ShiftWithSummary,
  StaffInput,
  StaffPublic,
  StockAdjustment,
  StockMove,
  TopSeller,
} from '@/types'
import { request } from './client'

export { ApiError, apiBaseUrl, apiMode, hasToken, setToken, setUnauthorizedHandler } from './client'

type ProductInput = Omit<Product, 'id'>
export interface Range {
  from: number
  to: number
  /** A branch id, or 'all' for the whole chain. Default: the session's branch. */
  branch?: string
}

const enc = encodeURIComponent

export const api = {
  auth: {
    /** Signs in at a branch (default: the person's first branch). */
    login: (pin: string, branchId?: string) =>
      request<LoginResponse>('POST', '/auth/login', { body: { pin, branchId } }),
    logout: () => request<null>('POST', '/auth/logout'),
    me: () => request<StaffPublic>('GET', '/auth/me'),
    /** The signed-in person and the branch this till works in. */
    session: () => request<Omit<LoginResponse, 'token'>>('GET', '/auth/session'),
    /** Moves this till to another branch (without signing out). */
    switchBranch: (branchId: string) =>
      request<Omit<LoginResponse, 'token'>>('POST', '/auth/branch', { body: { branchId } }),
  },

  branches: {
    list: () => request<Branch[]>('GET', '/branches'),
    create: (body: Omit<Branch, 'id'>) => request<Branch>('POST', '/branches', { body }),
    update: (id: string, body: Partial<Omit<Branch, 'id'>>) =>
      request<Branch>('PATCH', `/branches/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/branches/${enc(id)}`),
  },

  staff: {
    list: () => request<StaffPublic[]>('GET', '/staff'),
    create: (body: StaffInput) => request<StaffPublic>('POST', '/staff', { body }),
    update: (id: string, body: Partial<StaffInput>) =>
      request<StaffPublic>('PATCH', `/staff/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/staff/${enc(id)}`),
  },

  settings: {
    get: () => request<Settings>('GET', '/settings'),
    update: (body: Partial<Settings>) => request<Settings>('PATCH', '/settings', { body }),
  },

  exchangeRates: {
    /** Rates in effect on a day (default today): that day's, or the latest earlier ones. */
    get: (date?: string) =>
      request<EffectiveRates>('GET', '/exchange-rates', { query: date ? { date } : {} }),
    history: (limit = 30) =>
      request<ExchangeRateSet[]>('GET', '/exchange-rates/history', { query: { limit } }),
    set: (date: string, rates: RateEntry[]) =>
      request<ExchangeRateSet>('PUT', `/exchange-rates/${enc(date)}`, { body: { rates } }),
    remove: (date: string) => request<null>('DELETE', `/exchange-rates/${enc(date)}`),
  },

  floor: {
    get: () => request<FloorPlan>('GET', '/floor'),
    save: (body: FloorPlan) => request<FloorPlan>('PUT', '/floor', { body }),
    /** A new QR code for a table; the old one stops working. */
    newQr: (tableId: string) => request<DiningTable>('POST', `/floor/tables/${enc(tableId)}/qr`),
  },

  /** Guest ordering from the table's QR code (no sign-in). */
  guest: {
    menu: (table: string) => request<PublicMenu>('GET', '/public/menu', { query: { table } }),
    order: (body: SelfOrderRequest) => request<GuestOrder>('POST', '/public/orders', { body }),
    orders: (table: string, ids: string[]) =>
      request<GuestOrder[]>('GET', '/public/orders', { query: { table, ids: ids.join(',') } }),
  },

  /** Guest orders waiting for staff at this branch. */
  selfOrders: {
    list: (status: SelfOrderStatus | 'all' = 'pending') =>
      request<SelfOrder[]>('GET', '/self-orders', { query: { status } }),
    accept: (id: string) =>
      request<{ order: SelfOrder; held: HeldOrder }>('POST', `/self-orders/${enc(id)}/accept`),
    reject: (id: string, reason: string) =>
      request<SelfOrder>('POST', `/self-orders/${enc(id)}/reject`, { body: { reason } }),
  },

  stations: {
    list: () => request<Station[]>('GET', '/stations'),
    save: (stations: Partial<Station>[]) =>
      request<Station[]>('PUT', '/stations', { body: { stations } }),
  },

  tickets: {
    /** Sends items to the kitchen and bar: one ticket per station (none if nothing needs making). */
    create: (body: TicketRequest) => request<KitchenTicket[]>('POST', '/tickets', { body }),
    /** Open tickets, oldest first; or recently finished ones (`status: 'done'`), newest first. */
    list: (query: { status?: 'active' | 'done'; stationId?: string; limit?: number } = {}) =>
      request<KitchenTicket[]>('GET', '/tickets', { query }),
    update: (id: string, body: { status?: TicketStatus; item?: number; done?: boolean }) =>
      request<KitchenTicket>('PATCH', `/tickets/${enc(id)}`, { body }),
  },

  time: {
    /** Clock in, or out if already in, with a PIN (no sign-in needed). */
    clock: (pin: string, branchId?: string) =>
      request<{ action: 'in' | 'out'; entry: TimeEntry }>('POST', '/time/clock', {
        body: { pin, branchId },
      }),
    /** Who is clocked in at this branch now. */
    now: () => request<TimeEntry[]>('GET', '/time/now'),
    entries: (query: Range & { staff?: string }) =>
      request<Timesheet>('GET', '/time/entries', { query: { ...query } }),
    update: (id: string, body: { clockIn?: number; clockOut?: number | null; note?: string }) =>
      request<TimeEntry>('PATCH', `/time/entries/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/time/entries/${enc(id)}`),
  },

  promotions: {
    list: () => request<Promotion[]>('GET', '/promotions'),
    create: (body: Omit<Promotion, 'id'>) => request<Promotion>('POST', '/promotions', { body }),
    update: (id: string, body: Partial<Omit<Promotion, 'id'>>) =>
      request<Promotion>('PATCH', `/promotions/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/promotions/${enc(id)}`),
  },

  categories: {
    list: () => request<Category[]>('GET', '/categories'),
    create: (body: Omit<Category, 'id'>) => request<Category>('POST', '/categories', { body }),
    update: (id: string, body: Partial<Omit<Category, 'id'>>) =>
      request<Category>('PATCH', `/categories/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/categories/${enc(id)}`),
  },

  products: {
    list: (query: { q?: string; categoryId?: string; active?: boolean } = {}) =>
      request<Product[]>('GET', '/products', { query }),
    lookup: (code: string) => request<Product>('GET', '/products/lookup', { query: { code } }),
    get: (id: string) => request<Product>('GET', `/products/${enc(id)}`),
    create: (body: ProductInput) => request<Product>('POST', '/products', { body }),
    update: (id: string, body: Partial<ProductInput>) =>
      request<Product>('PATCH', `/products/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/products/${enc(id)}`),
  },

  stock: {
    low: () => request<Product[]>('GET', '/stock/low'),
    adjust: (body: StockAdjustment) =>
      request<{ product: Product; move: StockMove }>('POST', '/stock/adjustments', { body }),
    movements: (query: { productId?: string; limit?: number } = {}) =>
      request<StockMove[]>('GET', '/stock/movements', { query }),
  },

  orders: {
    create: (body: CheckoutRequest) => request<Order>('POST', '/orders', { body }),
    list: (
      query: Partial<Range> & {
        status?: 'completed' | 'refunded'
        q?: string
        customerId?: string
        limit?: number
        offset?: number
      } = {},
    ) => request<Page<Order>>('GET', '/orders', { query }),
    get: (id: string) => request<Order>('GET', `/orders/${enc(id)}`),
    refund: (id: string, body: { reason: string; restock: boolean; approvalId?: string | null }) =>
      request<Order>('POST', `/orders/${enc(id)}/refund`, { body }),
    /** Records a receipt reprint (in the activity log). */
    reprint: (id: string, approvalId?: string | null) =>
      request<Order>('POST', `/orders/${enc(id)}/reprint`, { body: { approvalId } }),
    topSellers: (query: { days?: number; limit?: number } = {}) =>
      request<TopSeller[]>('GET', '/orders/top-sellers', { query }),
  },

  held: {
    list: () => request<HeldOrder[]>('GET', '/held-orders'),
    create: (body: HeldOrderInput) => request<HeldOrder>('POST', '/held-orders', { body }),
    /** Replaces a held order's contents (saving a table's bill again). */
    update: (id: string, body: HeldOrderInput) =>
      request<HeldOrder>('PUT', `/held-orders/${enc(id)}`, { body }),
    /** Moves a bill to another table (or off tables, with null). */
    move: (id: string, tableId: string | null) =>
      request<HeldOrder>('POST', `/held-orders/${enc(id)}/move`, { body: { tableId } }),
    /** Merges other held orders into this one; they are removed. */
    merge: (id: string, ids: string[]) =>
      request<HeldOrder>('POST', `/held-orders/${enc(id)}/merge`, { body: { ids } }),
    /** Removes a held order and returns it. */
    remove: (id: string, approvalId?: string | null) =>
      request<HeldOrder>('DELETE', `/held-orders/${enc(id)}`, {
        query: approvalId ? { approvalId } : {},
      }),
  },

  customers: {
    list: (q = '') => request<Customer[]>('GET', '/customers', { query: { q } }),
    get: (id: string) => request<Customer>('GET', `/customers/${enc(id)}`),
    orders: (id: string, limit = 20) =>
      request<Order[]>('GET', `/customers/${enc(id)}/orders`, { query: { limit } }),
    create: (body: CustomerInput) => request<Customer>('POST', '/customers', { body }),
    update: (id: string, body: Partial<CustomerInput>) =>
      request<Customer>('PATCH', `/customers/${enc(id)}`, { body }),
    remove: (id: string) => request<null>('DELETE', `/customers/${enc(id)}`),
  },

  shifts: {
    current: () => request<ShiftWithSummary | null>('GET', '/shifts/current'),
    open: (openingFloat: number) =>
      request<ShiftWithSummary>('POST', '/shifts', { body: { openingFloat } }),
    moveCash: (body: {
      type: 'in' | 'out'
      amount: number
      reason: string
      approvalId?: string | null
    }) => request<ShiftWithSummary>('POST', '/shifts/current/cash-moves', { body }),
    close: (body: { countedCash: number; note: string }) =>
      request<ShiftWithSummary>('POST', '/shifts/current/close', { body }),
    history: (limit = 30) => request<ShiftWithSummary[]>('GET', '/shifts', { query: { limit } }),
  },

  /** A manager's PIN for a cashier's action. Throws WRONG_PIN or TOO_MANY_ATTEMPTS. */
  approvals: {
    request: (body: { pin: string; action: ApprovalAction; amount?: number }) =>
      request<Approval>('POST', '/approvals', { body }),
  },

  activity: {
    log: (
      query: Partial<Range> & {
        type?: AuditType
        staff?: string
        limit?: number
        offset?: number
      },
    ) => request<Page<AuditEntry>>('GET', '/audit', { query }),
    risk: (r: Range) => request<RiskReport>('GET', '/reports/risk', { query: { ...r } }),
    /** Records an order thrown away before it was saved or paid. */
    clearedOrder: (body: {
      total: number
      items: string
      table: string
      sent: boolean
      approvalId?: string | null
    }) => request<null>('POST', '/activity/cleared-order', { body }),
  },

  summary: {
    get: (date: string, branch?: string) =>
      request<DailySummary>('GET', '/reports/daily-summary', { query: { date, branch } }),
    outbox: () => request<OutboxEntry[]>('GET', '/summary/outbox'),
    send: (date: string, branch?: string) =>
      request<OutboxEntry>('POST', '/summary/send', { body: { date, branch } }),
  },

  reports: {
    summary: (r: Range) => request<ReportSummary>('GET', '/reports/summary', { query: { ...r } }),
    salesByTime: (r: Range & { bucket: 'hour' | 'day'; tz?: string }) =>
      request<SalesBucket[]>('GET', '/reports/sales-by-time', { query: { ...r } }),
    products: (r: Range & { limit?: number }) =>
      request<ProductSales[]>('GET', '/reports/products', { query: { ...r } }),
    breakdown: (r: Range & { by: BreakdownBy }) =>
      request<BreakdownRow[]>('GET', '/reports/breakdown', { query: { ...r } }),
  },

  backup: {
    export: () => request<BackupFile>('GET', '/backup'),
    restore: (file: unknown) => request<null>('POST', '/backup', { body: file }),
  },

  import: {
    /** Bulk create/update from spreadsheet rows. With dryRun, nothing is saved. */
    run: (kind: ImportKind, body: ImportRequest) =>
      request<ImportResult>('POST', `/import/${kind}`, { body }),
  },

  admin: {
    reset: (scope: ResetScope) => request<null>('POST', '/admin/reset', { body: { scope } }),
  },
}
