// Typed functions for every Sun POS endpoint. See docs/API.md for details.
import type {
  BackupFile,
  BreakdownBy,
  BreakdownRow,
  Category,
  CheckoutRequest,
  Customer,
  CustomerInput,
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
}

const enc = encodeURIComponent

export const api = {
  auth: {
    login: (pin: string) => request<LoginResponse>('POST', '/auth/login', { body: { pin } }),
    logout: () => request<null>('POST', '/auth/logout'),
    me: () => request<StaffPublic>('GET', '/auth/me'),
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
    refund: (id: string, body: { reason: string; restock: boolean }) =>
      request<Order>('POST', `/orders/${enc(id)}/refund`, { body }),
    topSellers: (query: { days?: number; limit?: number } = {}) =>
      request<TopSeller[]>('GET', '/orders/top-sellers', { query }),
  },

  held: {
    list: () => request<HeldOrder[]>('GET', '/held-orders'),
    create: (body: HeldOrderInput) => request<HeldOrder>('POST', '/held-orders', { body }),
    /** Removes a held order and returns it (used for both resume and discard). */
    remove: (id: string) => request<HeldOrder>('DELETE', `/held-orders/${enc(id)}`),
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
    moveCash: (body: { type: 'in' | 'out'; amount: number; reason: string }) =>
      request<ShiftWithSummary>('POST', '/shifts/current/cash-moves', { body }),
    close: (body: { countedCash: number; note: string }) =>
      request<ShiftWithSummary>('POST', '/shifts/current/close', { body }),
    history: (limit = 30) => request<ShiftWithSummary[]>('GET', '/shifts', { query: { limit } }),
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
