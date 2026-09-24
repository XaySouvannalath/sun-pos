import type {
  Category,
  OptionGroup,
  Order,
  OrderLine,
  OrderType,
  PaymentMethod,
  Product,
  Settings,
  Staff,
} from '@/types'
import { computeTotals, lineKey, roundTo } from '@/utils/pos'

export const defaultSettings: Settings = {
  storeName: 'Sun Café',
  address: '123 Riverside Road',
  phone: '+856 20 0000 0000',
  currency: 'USD',
  locale: 'en-US',
  decimals: 2,
  taxLabel: 'VAT',
  taxRate: 10,
  serviceRate: 0,
  receiptFooter: 'Thank you! See you again soon.',
  theme: 'light',
  pointsPerUnit: 1,
  topSellerDays: 30,
}

export const seedStaff: Staff[] = [
  { id: 'staff-admin', name: 'Manager', pin: '1234', role: 'admin' },
  { id: 'staff-cashier', name: 'Cashier', pin: '0000', role: 'cashier' },
]

export const seedCategories: Category[] = [
  { id: 'cat-coffee', name: 'Coffee', tint: 'sand' },
  { id: 'cat-tea', name: 'Tea', tint: 'sage' },
  { id: 'cat-smoothie', name: 'Smoothies', tint: 'rose' },
  { id: 'cat-food', name: 'Food', tint: 'amber' },
  { id: 'cat-bakery', name: 'Bakery', tint: 'lilac' },
  { id: 'cat-dessert', name: 'Desserts', tint: 'sky' },
]

const size = (): OptionGroup => ({
  id: 'size',
  name: 'Size',
  multiple: false,
  required: true,
  choices: [
    { name: 'Regular', price: 0 },
    { name: 'Large', price: 0.5 },
  ],
})
const temp = (): OptionGroup => ({
  id: 'temp',
  name: 'Temperature',
  multiple: false,
  required: true,
  choices: [
    { name: 'Hot', price: 0 },
    { name: 'Iced', price: 0.25 },
  ],
})
const milk = (): OptionGroup => ({
  id: 'milk',
  name: 'Milk',
  multiple: false,
  required: false,
  choices: [
    { name: 'Oat milk', price: 0.5 },
    { name: 'Almond milk', price: 0.5 },
    { name: 'Soy milk', price: 0.4 },
  ],
})
const coffeeExtras = (): OptionGroup => ({
  id: 'extras',
  name: 'Extras',
  multiple: true,
  required: false,
  choices: [
    { name: 'Extra shot', price: 0.75 },
    { name: 'Vanilla syrup', price: 0.5 },
    { name: 'Caramel syrup', price: 0.5 },
    { name: 'Less sugar', price: 0 },
  ],
})
const sweetness = (): OptionGroup => ({
  id: 'sweet',
  name: 'Sweetness',
  multiple: false,
  required: false,
  choices: [
    { name: 'No sugar', price: 0 },
    { name: 'Half sweet', price: 0 },
    { name: 'Extra sweet', price: 0 },
  ],
})
const foodExtras = (): OptionGroup => ({
  id: 'food-extras',
  name: 'Add-ons',
  multiple: true,
  required: false,
  choices: [
    { name: 'Fried egg', price: 1 },
    { name: 'Extra chicken', price: 2 },
    { name: 'No chilli', price: 0 },
  ],
})

type P = [string, string, string, number, number, number | null, OptionGroup[]]
// [name, category, emoji, price, cost, stock, options]
const items: P[] = [
  ['Espresso', 'cat-coffee', '☕', 2.5, 0.6, null, [temp(), coffeeExtras()]],
  ['Americano', 'cat-coffee', '☕', 3, 0.7, null, [size(), temp(), coffeeExtras()]],
  ['Cappuccino', 'cat-coffee', '☕', 3.75, 0.9, null, [size(), temp(), milk(), coffeeExtras()]],
  ['Café Latte', 'cat-coffee', '🥛', 3.75, 0.9, null, [size(), temp(), milk(), coffeeExtras()]],
  ['Lao Iced Coffee', 'cat-coffee', '🧋', 3.25, 0.8, null, [size(), sweetness()]],
  ['Mocha', 'cat-coffee', '🍫', 4.25, 1.1, null, [size(), temp(), milk(), coffeeExtras()]],
  ['Green Tea Latte', 'cat-tea', '🍵', 4, 1, null, [size(), temp(), milk(), sweetness()]],
  ['Thai Milk Tea', 'cat-tea', '🧋', 3.5, 0.8, null, [size(), sweetness()]],
  ['Lemon Iced Tea', 'cat-tea', '🍋', 3, 0.6, null, [size(), sweetness()]],
  ['Jasmine Tea', 'cat-tea', '🫖', 2.75, 0.5, null, [temp()]],
  ['Mango Smoothie', 'cat-smoothie', '🥭', 4.5, 1.3, null, [size(), sweetness()]],
  ['Strawberry Smoothie', 'cat-smoothie', '🍓', 4.5, 1.4, null, [size(), sweetness()]],
  ['Passion Fruit Soda', 'cat-smoothie', '🥤', 3.75, 0.9, null, [size()]],
  ['Chicken Fried Rice', 'cat-food', '🍛', 6.5, 2.2, 40, [foodExtras()]],
  ['Pad Kra Pao', 'cat-food', '🌶️', 6.75, 2.3, 35, [foodExtras()]],
  ['Club Sandwich', 'cat-food', '🥪', 6, 2, 25, []],
  ['Noodle Soup (Feu)', 'cat-food', '🍜', 5.5, 1.8, 30, [foodExtras()]],
  ['Caesar Salad', 'cat-food', '🥗', 5.75, 1.9, 20, []],
  ['Butter Croissant', 'cat-bakery', '🥐', 2.75, 0.8, 30, []],
  ['Pain au Chocolat', 'cat-bakery', '🥐', 3.25, 0.9, 24, []],
  ['Banana Bread', 'cat-bakery', '🍞', 3, 0.7, 18, []],
  ['Blueberry Muffin', 'cat-bakery', '🧁', 3, 0.8, 4, []],
  ['Chocolate Cake', 'cat-dessert', '🍰', 4.5, 1.3, 12, []],
  ['Mango Sticky Rice', 'cat-dessert', '🥭', 4.75, 1.4, 15, []],
  ['Coconut Ice Cream', 'cat-dessert', '🍨', 3.5, 0.9, 3, []],
]

export const seedProducts: Product[] = items.map(
  ([name, categoryId, emoji, price, cost, stock, options], i) => ({
    id: `prd-${i + 1}`,
    name,
    categoryId,
    emoji,
    price,
    cost,
    stock,
    lowStockAt: 5,
    sku: `SKU-${String(i + 1).padStart(3, '0')}`,
    barcode: String(8850000000000 + i + 1),
    active: true,
    options,
  }),
)

/** Tiny deterministic PRNG so demo data is the same on every reset. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** ~14 days of plausible sales so top sellers and reports have content on first run. */
export function buildDemoOrders(
  products: Product[],
  settings: Settings,
  staff: Staff[],
  now = Date.now(),
): Order[] {
  const rand = mulberry32(42)
  // Popularity weights: earlier coffee/tea items and a few foods sell the most.
  const popular: Record<string, number> = {
    'Café Latte': 10,
    'Lao Iced Coffee': 9,
    'Thai Milk Tea': 8,
    Americano: 7,
    'Chicken Fried Rice': 6,
    'Mango Smoothie': 5,
    'Butter Croissant': 5,
    Cappuccino: 4,
    'Mango Sticky Rice': 4,
  }
  const pool = products.filter((p) => p.active)
  const weights = pool.map((p) => popular[p.name] ?? 1.5)
  const totalW = weights.reduce((a, b) => a + b, 0)
  const pick = () => {
    let x = rand() * totalW
    for (let i = 0; i < pool.length; i++) {
      x -= weights[i]!
      if (x <= 0) return pool[i]!
    }
    return pool[pool.length - 1]!
  }

  const orders: Order[] = []
  let number = 1
  const types: OrderType[] = ['dine-in', 'dine-in', 'takeaway', 'takeaway', 'delivery']
  const methods: PaymentMethod[] = ['cash', 'cash', 'card', 'qr', 'qr']
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  for (let d = 13; d >= 0; d--) {
    const dayStart = today.getTime() - d * 86400000
    const count = 10 + Math.floor(rand() * 12)
    const times = Array.from({ length: count }, () => {
      const hour = 7 + Math.floor(rand() * 13) // 7:00–19:59
      return dayStart + hour * 3600000 + Math.floor(rand() * 3600000)
    })
      .filter((t) => t < now)
      .sort((a, b) => a - b)

    for (const createdAt of times) {
      const lines: OrderLine[] = []
      const n = 1 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const p = pick()
        const opts = p.options
          .filter((g) => g.required)
          .map((g) => ({ group: g.name, name: g.choices[0]!.name, price: g.choices[0]!.price }))
        const key = lineKey(p.id, opts)
        const existing = lines.find((l) => l.key === key)
        if (existing) existing.qty++
        else
          lines.push({
            key,
            productId: p.id,
            name: p.name,
            emoji: p.emoji,
            categoryId: p.categoryId,
            unitPrice: p.price + opts.reduce((s, o) => s + o.price, 0),
            qty: 1 + (rand() < 0.2 ? 1 : 0),
            options: opts,
            note: '',
            discountPct: 0,
          })
      }
      const discount = { type: 'percent' as const, value: rand() < 0.08 ? 10 : 0 }
      const totals = computeTotals(lines, discount, settings)
      const method = methods[Math.floor(rand() * methods.length)]!
      const tendered =
        method === 'cash' ? Math.ceil(totals.total / 5) * 5 || totals.total : totals.total
      const who = staff[Math.floor(rand() * staff.length)]!
      orders.push({
        ...totals,
        id: `demo-${number}`,
        number: number++,
        createdAt,
        lines,
        orderDiscount: discount,
        orderType: types[Math.floor(rand() * types.length)]!,
        table: '',
        note: '',
        customerId: null,
        payments: [{ method, amount: tendered }],
        tendered,
        change: roundTo(tendered - totals.total, settings.decimals),
        staffId: who.id,
        staffName: who.name,
        shiftId: null,
        status: 'completed',
        refund: null,
        pointsEarned: 0,
      })
    }
  }
  // Newest first, matching how live orders are stored.
  return orders.reverse()
}
