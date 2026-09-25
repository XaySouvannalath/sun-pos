// Exchange-rate helpers, shared by the app and the mock backend.
// Only relative imports here: this module also runs inside the Vite config (Node).
import type { EffectiveRates, ExchangeRateSet, RateEntry } from '../types.ts'

/** Local calendar date as YYYY-MM-DD. */
export function localDate(ts = Date.now()): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const isDateKey = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** Currencies offered for rates and as the store currency. */
export const currencies = ['USD', 'LAK', 'THB', 'CNY', 'EUR', 'VND'] as const

/** Decimal places used when showing an amount in a currency. */
export function currencyDecimals(code: string): number {
  return code === 'LAK' || code === 'VND' ? 0 : 2
}

/**
 * Rough value order, strongest first. Only used to pick the natural way to type a rate
 * ("1 USD = 21,850 LAK" rather than "1 LAK = 0.0000458 USD").
 */
const strength = ['EUR', 'USD', 'CNY', 'THB', 'LAK', 'VND']
const rank = (code: string) => {
  const i = strength.indexOf(code)
  return i < 0 ? 2.5 : i
}
/** True when one unit of `code` is (roughly) worth more than one unit of `base`. */
export const strongerThan = (code: string, base: string) => rank(code) < rank(base)

/**
 * A rate written the easy-to-read way, with the big number on the right:
 * "1 USD = 21,850 LAK" or "1 THB = 625 LAK".
 */
export function ratePair(base: string, entry: RateEntry) {
  return entry.rate >= 1
    ? { one: entry.currency, other: base, value: entry.rate }
    : { one: base, other: entry.currency, value: 1 / entry.rate }
}

/** Converts an amount in the store currency into `entry.currency`. */
export function convert(amount: number, entry: RateEntry): number {
  const d = 10 ** currencyDecimals(entry.currency)
  return Math.round((amount / entry.rate) * d) / d
}

/**
 * Re-expresses a rate set in another store currency, when the set includes that currency.
 * Lets rates entered as "per USD" keep working after the store switches to LAK.
 */
export function rebase(set: Pick<ExchangeRateSet, 'base' | 'rates'>, base: string) {
  if (set.base === base) return set.rates
  const pivot = set.rates.find((r) => r.currency === base)
  if (!pivot) return null
  return [
    { currency: set.base, rate: 1 / pivot.rate },
    ...set.rates
      .filter((r) => r.currency !== base)
      .map((r) => ({ currency: r.currency, rate: r.rate / pivot.rate })),
  ]
}

/** The rates to use on `date`: that day's set, or the latest one before it. */
export function effectiveRates(
  sets: ExchangeRateSet[],
  base: string,
  date: string,
): EffectiveRates {
  const past = sets.filter((s) => s.date <= date).sort((a, b) => b.date.localeCompare(a.date))
  for (const s of past) {
    const rates = rebase(s, base)
    if (rates?.length) return { date, effectiveDate: s.date, base, rates }
  }
  return { date, effectiveDate: null, base, rates: [] }
}
