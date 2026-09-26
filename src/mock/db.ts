// In-memory database for the mock API, seeded from the JSON files in ./data.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type { DbData, ExchangeRateSet, Order, ResetScope, TimeEntry } from '../types.ts'
import { localDate } from '../utils/rates.ts'
import settings from './data/settings.json' with { type: 'json' }
import staff from './data/staff.json' with { type: 'json' }
import categories from './data/categories.json' with { type: 'json' }
import products from './data/products.json' with { type: 'json' }
import customers from './data/customers.json' with { type: 'json' }
import orders from './data/orders.json' with { type: 'json' }
import rates from './data/exchange-rates.json' with { type: 'json' }
import floor from './data/floor.json' with { type: 'json' }
import floorAirport from './data/floor-airport.json' with { type: 'json' }
import branches from './data/branches.json' with { type: 'json' }
import promotions from './data/promotions.json' with { type: 'json' }
import stations from './data/stations.json' with { type: 'json' }

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

/**
 * A week of demo exchange rates ending today. exchange-rates.json lists how many units of
 * each currency one unit of the base buys; the stored rate is the other way round.
 */
export function demoRates(now = Date.now()): ExchangeRateSet[] {
  const sets: ExchangeRateSet[] = []
  for (let i = 6; i >= 0; i--) {
    const at = startOfDay(now) - i * DAY + 8 * 3600000
    // Small, repeatable day-to-day movement (up to ±0.4%).
    const drift = 1 + (((i * 37) % 9) - 4) / 1000
    sets.unshift({
      date: localDate(at),
      base: rates.base,
      rates: Object.entries(rates.perBase as Record<string, number>).map(([currency, per]) => {
        // Round the way a person would type it: whole kip, 2 decimals for baht and yuan, and
        // "1 EUR = 1.087 USD" for a currency worth more than the base.
        if (per < 1) return { currency, rate: Math.round(10000 / per) / 10000 }
        const moved = per * drift
        return {
          currency,
          rate: 1 / (per >= 1000 ? Math.round(moved) : Math.round(moved * 100) / 100),
        }
      }),
      updatedBy: 'Admin',
      updatedAt: at,
    })
  }
  return sets
}

/** Two weeks of demo clock-ins (not today), so timesheets have something to show. */
export function demoTimeEntries(now = Date.now()): TimeEntry[] {
  const HOUR = 3600000
  const list: TimeEntry[] = []
  const people = [
    { staffId: 'staff-cashier', staffName: 'Cashier', start: 7.5, hours: 8 },
    { staffId: 'staff-admin', staffName: 'Manager', start: 10, hours: 7.5 },
  ]
  for (let i = 1; i <= 13; i++) {
    const day = startOfDay(now) - i * DAY
    const weekday = new Date(day).getDay()
    for (const [n, p] of people.entries()) {
      // Each person has one day off a week.
      if (weekday === (n === 0 ? 2 : 0)) continue
      // A few minutes early or late, the same every time the data is seeded.
      const jitter = ((((i * 7 + n * 11) % 13) - 6) * 60000 * 5) / 2
      const clockIn = day + p.start * HOUR + jitter
      list.push({
        id: `tim-demo-${i}-${n}`,
        staffId: p.staffId,
        staffName: p.staffName,
        branchId: 'br-main',
        clockIn,
        clockOut: clockIn + p.hours * HOUR - jitter / 2,
        editedBy: null,
        note: '',
      })
    }
  }
  return list
}

/** A hard-to-guess code for a table's QR link. */
export function qrToken(): string {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

/** Gives tables without a QR token one; returns whether any changed. */
export function giveQrTokens(data: DbData): boolean {
  let changed = false
  for (const plan of Object.values(data.floors))
    for (const tb of plan.tables)
      if (!tb.qrToken) {
        tb.qrToken = qrToken()
        changed = true
      }
  return changed
}

export function seedData(now = Date.now()): DbData {
  const data: DbData = {
    settings: clone(settings) as DbData['settings'],
    staff: clone(staff) as DbData['staff'],
    categories: clone(categories) as DbData['categories'],
    products: clone(products) as DbData['products'],
    customers: clone(customers) as DbData['customers'],
    orders: demoOrders(now),
    stockMoves: [],
    shifts: [],
    held: [],
    exchangeRates: demoRates(now),
    branches: clone(branches) as DbData['branches'],
    promotions: clone(promotions) as DbData['promotions'],
    timeEntries: demoTimeEntries(now),
    selfOrders: [],
    floors: {
      'br-main': clone(floor) as DbData['floors'][string],
      'br-airport': clone(floorAirport) as DbData['floors'][string],
    },
    stations: clone(stations) as DbData['stations'],
    tickets: [],
    audit: [],
    outbox: [],
  }
  giveQrTokens(data)
  return data
}

export function createDb(adapter: DbAdapter): Db {
  const loaded = adapter.load()
  // Fill in any collections missing from an older save.
  const data: DbData = loaded ? { ...seedData(), ...loaded } : seedData()
  if (loaded) {
    const seed = seedData().settings
    data.settings = { ...seed, ...loaded.settings }
    // Settings groups added later: fill in any missing fields.
    data.settings.controls = { ...seed.controls, ...loaded.settings.controls }
    data.settings.dailySummary = { ...seed.dailySummary, ...loaded.settings.dailySummary }
    data.settings.selfOrder = { ...seed.selfOrder, ...loaded.settings.selfOrder }
    // Older saves: categories without a station, held orders without a table.
    const seedStations = new Map(seedData().categories.map((c) => [c.id, c.stationId]))
    for (const c of data.categories) c.stationId ??= seedStations.get(c.id) ?? null
    // Before branches: one floor plan, which becomes the main branch's.
    const old = loaded as DbData & { floor?: DbData['floors'][string] }
    if (old.floor && !loaded.floors) data.floors = { [data.branches[0]!.id]: old.floor }
    delete (data as { floor?: unknown }).floor
    for (const h of data.held) {
      h.tableId ??= null
      h.voids ??= []
      h.updatedAt ??= h.heldAt
    }
  }

  // Every table gets a QR code for guest ordering. Tokens are saved at once, so printed codes keep working.
  const missingQr = giveQrTokens(data)

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
        db.data.tickets = []
        db.data.audit = []
        db.data.outbox = []
        db.data.timeEntries = scope === 'demo' ? demoTimeEntries() : []
        db.data.selfOrders = []
      }
      db.save()
    },
  }
  if (!loaded || missingQr) db.save()
  return db
}

/** Adapter that keeps everything in memory (used by tests). */
export function memoryAdapter(initial: DbData | null = null): DbAdapter {
  let saved = initial
  return { load: () => saved, save: (d) => (saved = d) }
}
