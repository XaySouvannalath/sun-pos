// In-memory database for the mock API, seeded from the JSON files in ./data.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type { DbData, Order, ResetScope } from '../types.ts'
import settings from './data/settings.json' with { type: 'json' }
import staff from './data/staff.json' with { type: 'json' }
import categories from './data/categories.json' with { type: 'json' }
import products from './data/products.json' with { type: 'json' }
import customers from './data/customers.json' with { type: 'json' }
import orders from './data/orders.json' with { type: 'json' }

/** Where the database is saved between requests (a JSON file, or browser storage). */
export interface DbAdapter {
  load(): DbData | null
  save(data: DbData): void
}

export interface Db {
  data: DbData
  save(): void
  reset(scope: ResetScope): void
}

const DAY = 86400000
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function startOfDay(ts: number) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Demo orders from orders.json, moved forward in time so the newest one falls on today.
 * This keeps "today", the top sellers and the reports populated whenever the data is seeded.
 */
export function demoOrders(now = Date.now()): Order[] {
  const list = clone(orders) as Order[]
  const newest = list.reduce((m, o) => Math.max(m, o.createdAt), 0)
  if (!newest) return list
  const shift = Math.round((startOfDay(now) - startOfDay(newest)) / DAY) * DAY
  for (const o of list) o.createdAt += shift
  // Drop anything that would land in the future after the shift.
  return list.filter((o) => o.createdAt <= now)
}

export function seedData(now = Date.now()): DbData {
  return {
    settings: clone(settings) as DbData['settings'],
    staff: clone(staff) as DbData['staff'],
    categories: clone(categories) as DbData['categories'],
    products: clone(products) as DbData['products'],
    customers: clone(customers) as DbData['customers'],
    orders: demoOrders(now),
    stockMoves: [],
    shifts: [],
    held: [],
  }
}

export function createDb(adapter: DbAdapter): Db {
  const loaded = adapter.load()
  // Fill in any collections missing from an older save.
  const data: DbData = loaded ? { ...seedData(), ...loaded } : seedData()
  if (loaded) data.settings = { ...seedData().settings, ...loaded.settings }

  const db: Db = {
    data,
    save: () => adapter.save(db.data),
    reset(scope) {
      if (scope === 'all') db.data = seedData()
      else {
        db.data.orders = scope === 'demo' ? demoOrders() : []
        db.data.shifts = []
        db.data.stockMoves = []
        db.data.held = []
      }
      db.save()
    },
  }
  if (!loaded) db.save()
  return db
}

/** Adapter that keeps everything in memory (used by tests). */
export function memoryAdapter(initial: DbData | null = null): DbAdapter {
  let saved = initial
  return { load: () => saved, save: (d) => (saved = d) }
}
