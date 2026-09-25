export type Role = 'admin' | 'cashier'

export interface Staff {
  id: string
  name: string
  pin: string
  role: Role
}

export type Tint = 'sage' | 'amber' | 'rose' | 'sky' | 'lilac' | 'sand'

export interface Category {
  id: string
  name: string
  tint: Tint
  /** Where this category's items are prepared (kitchen, bar…), or null for no ticket. */
  stationId: string | null
}

export interface OptionChoice {
  name: string
  price: number
}

export interface OptionGroup {
  id: string
  name: string
  /** Allow picking several choices (e.g. extras) instead of exactly one (e.g. size). */
  multiple: boolean
  required: boolean
  choices: OptionChoice[]
}

export interface Product {
  id: string
  name: string
  categoryId: string
  price: number
  cost: number
  sku: string
  barcode: string
  emoji: string
  /** null means stock is not tracked (e.g. made-to-order drinks). */
  stock: number | null
  lowStockAt: number
  active: boolean
  options: OptionGroup[]
}

export interface SelectedOption {
  group: string
  name: string
  price: number
}

export interface OrderLine {
  /** Client-side row id for the cart (optional; the server ignores it). */
  id?: string
  key: string
  productId: string
  name: string
  emoji: string
  categoryId: string
  /** Base price plus selected option prices. */
  unitPrice: number
  qty: number
  options: SelectedOption[]
  note: string
  discountPct: number
  /** How many of `qty` have already been sent to the kitchen or bar. */
  sentQty?: number
}

export type DiscountType = 'percent' | 'amount'

export interface Discount {
  type: DiscountType
  value: number
}

export type OrderType = 'dine-in' | 'takeaway' | 'delivery'

export type PaymentMethod = 'cash' | 'card' | 'qr'

export interface Payment {
  method: PaymentMethod
  amount: number
  /** When a bill is split equally: which guest (1, 2, …) made this payment. */
  guest?: number
}

export interface Totals {
  itemCount: number
  subtotal: number
  discount: number
  service: number
  tax: number
  total: number
}

export interface Refund {
  at: number
  by: string
  reason: string
  shiftId: string | null
}

export interface Order extends Totals {
  id: string
  number: number
  createdAt: number
  lines: OrderLine[]
  orderDiscount: Discount
  orderType: OrderType
  table: string
  tableId?: string | null
  note: string
  customerId: string | null
  payments: Payment[]
  tendered: number
  change: number
  staffId: string
  staffName: string
  shiftId: string | null
  status: 'completed' | 'refunded'
  refund: Refund | null
  pointsEarned: number
  /** Exchange rates in effect when the order was paid, printed on the receipt. */
  exchangeRates?: RateSnapshot | null
  /** Set when the bill was split equally: the number of guests sharing it. */
  splitWays?: number
}

/** A removed item that was already sent to the kitchen. */
export interface VoidLine extends OrderLine {
  approvalId?: string | null
}

export interface HeldOrder {
  id: string
  label: string
  heldAt: number
  lines: OrderLine[]
  discount: Discount
  orderType: OrderType
  table: string
  /** The table on the floor plan, when the order belongs to one. */
  tableId: string | null
  note: string
  customerId: string | null
  /** Items removed after they were sent, still to be reported to the kitchen as cancelled. */
  voids: VoidLine[]
  updatedAt: number
}

// ----- Floor plan -----

export type TableShape = 'square' | 'round' | 'rect'

export interface FloorArea {
  id: string
  name: string
}

/** A table on the floor plan. Position and size are in plan units (the plan is 1000 × 640). */
export interface DiningTable {
  id: string
  name: string
  areaId: string
  seats: number
  shape: TableShape
  x: number
  y: number
  w: number
  h: number
}

export interface FloorPlan {
  areas: FloorArea[]
  tables: DiningTable[]
}

// ----- Kitchen and bar -----

export interface Station {
  id: string
  name: string
}

export type TicketStatus = 'new' | 'preparing' | 'ready' | 'done'

export interface TicketItem {
  name: string
  emoji: string
  qty: number
  options: string[]
  note: string
  /** A cancelled item: the kitchen should stop making it. */
  cancelled: boolean
  /** Ticked off by the kitchen. */
  done: boolean
}

export interface KitchenTicket {
  id: string
  number: number
  stationId: string
  createdAt: number
  status: TicketStatus
  /** When it last changed status. */
  statusAt: number
  label: string
  orderType: OrderType
  table: string
  tableId: string | null
  note: string
  staffName: string
  items: TicketItem[]
}

/** An item to send: the product, how many, and its options by name. */
export interface TicketLineInput {
  productId: string
  qty: number
  options: string[]
  note: string
  cancelled?: boolean
  /** A cancelled item: the manager's approval, when needed. */
  approvalId?: string | null
}

export interface TicketRequest {
  label: string
  orderType: OrderType
  table: string
  tableId: string | null
  note: string
  lines: TicketLineInput[]
}

export interface Customer {
  id: string
  name: string
  phone: string
  email: string
  note: string
  points: number
  totalSpent: number
  visits: number
  createdAt: number
}

export interface StockMove {
  id: string
  at: number
  productId: string
  delta: number
  reason: string
  by: string
}

export interface CashMove {
  at: number
  type: 'in' | 'out'
  amount: number
  reason: string
  by: string
}

export interface Shift {
  id: string
  openedAt: number
  openedBy: string
  openingFloat: number
  cashMoves: CashMove[]
  closedAt: number | null
  closedBy: string | null
  countedCash: number | null
  expectedCash: number | null
  note: string
}

/** Per-device display preference (not part of the store settings). */
export type ThemeMode = 'light' | 'dark' | 'system'

/** Per-device animation preference. "system" follows the device's reduce-motion setting. */
export type MotionMode = 'on' | 'off' | 'system'

export interface Settings {
  storeName: string
  address: string
  phone: string
  currency: string
  locale: string
  decimals: number
  taxLabel: string
  taxRate: number
  serviceRate: number
  receiptFooter: string
  /** Loyalty points earned per 1 unit of currency spent. */
  pointsPerUnit: number
  topSellerDays: number
  /** Print the day's exchange rates and converted total on receipts. */
  receiptShowRates: boolean
  /** Staff controls: what cashiers need a manager's PIN for. */
  controls: StaffControls
  /** The end-of-day summary sent to the owner. */
  dailySummary: DailySummarySettings
}

export interface StaffControls {
  /** Cashiers may discount up to this percent without a manager (0 = always ask). */
  discountLimitPct: number
  /** Removing items already sent to the kitchen (or deleting such an order) needs a manager. */
  approveVoids: boolean
  /** Taking cash out of the drawer needs a manager. */
  approveCashOut: boolean
  /** Reprinting a receipt needs a manager. */
  approveReprint: boolean
  /** Cashiers close their shift without seeing the expected cash. */
  blindCount: boolean
  /** Cash over or short by more than this is flagged. */
  cashTolerance: number
}

export interface DailySummarySettings {
  enabled: boolean
  /** When the summary is sent: when a shift closes, or at a set time. */
  sendAt: 'shiftClose' | 'time'
  /** HH:MM, local time. */
  time: string
  language: 'en' | 'lo' | 'zh' | 'vi'
  /** Comma-separated recipients per channel. */
  telegram: string
  whatsapp: string
  email: string
}

// ----- Approvals and activity -----

/** Actions a cashier needs a manager's PIN for. */
export type ApprovalAction = 'discount' | 'void' | 'refund' | 'cashOut' | 'reprint'

export interface Approval {
  id: string
  action: ApprovalAction
  managerName: string
  /** For discounts: the highest percent approved. */
  amount: number
  at: number
}

export type AuditType =
  | 'discount'
  | 'void'
  | 'orderDeleted'
  | 'refund'
  | 'cashIn'
  | 'cashOut'
  | 'reprint'
  | 'shiftClosed'
  | 'approvalFailed'

/** One sensitive action, for the activity log. */
export interface AuditEntry {
  id: string
  at: number
  type: AuditType
  staffId: string
  staffName: string
  /** The manager who approved it, when a cashier needed approval. */
  approvedBy: string | null
  /** Money involved (for a closed shift: counted minus expected). */
  amount: number
  orderNumber: number | null
  table: string
  /** Items, reason or note. */
  detail: string
}

export type RiskAlertCode =
  | 'cashShort'
  | 'cashOver'
  | 'manyVoids'
  | 'highDiscounts'
  | 'refunds'
  | 'deletedOrders'
  | 'failedPins'

export interface RiskAlert {
  level: 'warn' | 'info'
  code: RiskAlertCode
  staffName: string
  /** Numbers for the message. */
  amount: number
  count: number
  pct: number
}

export interface StaffRisk {
  staffName: string
  sales: number
  orders: number
  discounts: number
  discountCount: number
  voids: number
  voidCount: number
  refunds: number
  refundCount: number
  cashOut: number
  deleted: number
  /** Counted minus expected over this person's closed shifts. */
  overShort: number
  flagged: boolean
}

export interface RiskReport {
  from: number
  to: number
  staff: StaffRisk[]
  alerts: RiskAlert[]
}

export interface DailySummary {
  date: string
  sales: number
  orders: number
  avg: number
  items: number
  /** The same weekday a week earlier, for comparison. */
  lastWeek: { sales: number; orders: number }
  payments: { method: PaymentMethod; amount: number }[]
  top: { name: string; qty: number; revenue: number }[]
  shifts: {
    staffName: string
    openedAt: number
    closedAt: number | null
    expected: number
    counted: number | null
    diff: number | null
  }[]
  discounts: number
  voids: { count: number; value: number }
  refunds: { count: number; value: number }
  cashOut: number
  alerts: RiskAlert[]
}

/** A summary queued for sending (the backend delivers it). */
export interface OutboxEntry {
  id: string
  at: number
  date: string
  trigger: 'shiftClose' | 'time' | 'manual'
  channels: string[]
  status: 'queued' | 'sent' | 'failed'
  summary: DailySummary
}

// ----- Exchange rates -----

/** `rate` is how many units of the store currency one unit of `currency` is worth. */
export interface RateEntry {
  currency: string
  rate: number
}

/** The exchange rates set for one day. */
export interface ExchangeRateSet {
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Store currency the rates are relative to. */
  base: string
  rates: RateEntry[]
  updatedBy: string
  updatedAt: number
}

export interface RateSnapshot {
  date: string
  base: string
  rates: RateEntry[]
}

/** The rates to use on a day: that day's set, or the most recent earlier one. */
export interface EffectiveRates {
  /** The day asked for. */
  date: string
  /** The day the rates were set, or null when no rates are set yet. */
  effectiveDate: string | null
  base: string
  rates: RateEntry[]
}

// ---------------------------------------------------------------------------
// API types (request and response bodies). See docs/API.md.
// ---------------------------------------------------------------------------

/** A staff member as returned by the API: PINs are never sent to clients. */
export type StaffPublic = Omit<Staff, 'pin'>

export interface StaffInput {
  name: string
  role: Role
  /** Required when creating. When updating, leave empty to keep the current PIN. */
  pin?: string
}

export interface LoginResponse {
  token: string
  user: StaffPublic
}

export interface CheckoutLine {
  productId: string
  qty: number
  options: { group: string; name: string }[]
  note: string
  discountPct: number
  /** Already sent to the kitchen; only the rest gets a ticket. */
  sentQty?: number
}

export interface CheckoutRequest {
  /** Client-generated id. Sending the same id twice returns the first order instead of charging again. */
  id?: string
  orderType: OrderType
  table: string
  note: string
  customerId: string | null
  orderDiscount: Discount
  lines: CheckoutLine[]
  payments: Payment[]
  /** Split equally: this payment is one guest's share of a bill shared by this many guests. */
  splitWays?: number
  tableId?: string | null
  /** The held (table) order this sale pays for; it is closed with the sale. */
  heldId?: string | null
  /** Cancelled items not yet reported to the kitchen. */
  voids?: TicketLineInput[]
  /** A manager's approval for a discount above the cashier's limit. */
  discountApprovalId?: string | null
}

export type HeldOrderInput = Omit<HeldOrder, 'id' | 'heldAt' | 'updatedAt'>

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'email' | 'note'>

export interface StockAdjustment {
  productId: string
  delta: number
  reason: string
}

export interface ShiftSummary {
  orders: number
  refunds: number
  gross: number
  refunded: number
  byMethod: Record<PaymentMethod, number>
  cashSales: number
  cashRefunds: number
  cashIn: number
  cashOut: number
  expectedCash: number
  /** Blind count: cash figures are hidden from this cashier. */
  blind?: boolean
}

export interface ShiftWithSummary {
  shift: Shift
  summary: ShiftSummary
}

export interface TopSeller {
  product: Product
  qty: number
  revenue: number
}

export interface Page<T> {
  items: T[]
  total: number
}

export interface ReportSummary {
  net: number
  orders: number
  avg: number
  items: number
  tax: number
  discounts: number
  profit: number
  margin: number
  refunds: number
  refundCount: number
}

export interface SalesBucket {
  /** Start of the bucket (epoch ms). */
  start: number
  /** Hour of day ("7") for hourly buckets, local date ("2026-09-24") for daily ones. */
  label: string
  value: number
  count: number
}

export interface ProductSales {
  productId: string
  name: string
  emoji: string
  qty: number
  revenue: number
}

export type BreakdownBy = 'payment' | 'category' | 'orderType' | 'staff'

export interface BreakdownRow {
  key: string
  value: number
  pct: number
}

export type ResetScope = 'sales' | 'demo' | 'all'

export interface DbData {
  settings: Settings
  staff: Staff[]
  categories: Category[]
  products: Product[]
  stockMoves: StockMove[]
  customers: Customer[]
  orders: Order[]
  shifts: Shift[]
  held: HeldOrder[]
  exchangeRates: ExchangeRateSet[]
  floor: FloorPlan
  stations: Station[]
  tickets: KitchenTicket[]
  audit: AuditEntry[]
  outbox: OutboxEntry[]
}

export interface BackupFile {
  app: 'sun-pos'
  version: 2
  at: number
  data: DbData
}

// ----- Bulk import (POST /import/:kind) -----

export type ImportKind = 'products' | 'customers' | 'staff' | 'stock'

/** A spreadsheet cell as sent to the import endpoint. Strings are parsed leniently ("1,250.50", "yes"). */
export type ImportCell = string | number | boolean | null

export interface ImportRequest {
  /** One object per spreadsheet row, keyed by field name (e.g. { name, category, price }). */
  rows: Record<string, ImportCell>[]
  /** true: check every row and report what would happen, without saving anything. */
  dryRun?: boolean
}

export interface ImportRowResult {
  /** Position in the `rows` array (0-based). */
  index: number
  action: 'create' | 'update' | 'skip' | 'error'
  /** What the row refers to, e.g. the product name. */
  label: string
  /** Why a row failed, or a note such as "New category: Juices". */
  message: string
}

export interface ImportResult {
  dryRun: boolean
  created: number
  updated: number
  skipped: number
  failed: number
  rows: ImportRowResult[]
}
