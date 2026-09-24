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
}

export interface HeldOrder {
  id: string
  label: string
  heldAt: number
  lines: OrderLine[]
  discount: Discount
  orderType: OrderType
  table: string
  note: string
  customerId: string | null
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

export type ThemeMode = 'light' | 'dark' | 'system'

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
  theme: ThemeMode
  /** Loyalty points earned per 1 unit of currency spent. */
  pointsPerUnit: number
  topSellerDays: number
}
