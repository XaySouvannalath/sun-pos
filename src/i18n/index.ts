// Small translation layer: English is the source; every other language must have the
// same keys (checked by TypeScript). Choose the language per device, like the theme.
import { computed, watchEffect } from 'vue'
import { persisted } from '@/composables/persisted'
import en, { type Messages } from './locales/en'
import lo from './locales/lo'
import zh from './locales/zh'
import vi from './locales/vi'

export type Language = 'en' | 'lo' | 'zh' | 'vi'

export const languages: { id: Language; name: string; intl: string }[] = [
  { id: 'en', name: 'English', intl: 'en-US' },
  { id: 'lo', name: 'ລາວ', intl: 'lo-LA' },
  { id: 'zh', name: '中文', intl: 'zh-CN' },
  { id: 'vi', name: 'Tiếng Việt', intl: 'vi-VN' },
]

const catalogs: Record<Language, Messages> = { en, lo, zh, vi }

/** First visit: use the device language if we have it, otherwise English. */
function detect(): Language {
  const list = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : []
  for (const tag of list) {
    const base = tag.toLowerCase().split('-')[0] as Language
    if (base in catalogs) return base
  }
  return 'en'
}

export const language = persisted<Language>('language', detect)
if (!(language.value in catalogs)) language.value = 'en'

/** BCP 47 tag for dates and times in the chosen language. */
export const intlLocale = computed(
  () => languages.find((l) => l.id === language.value)?.intl ?? 'en-US',
)

if (typeof document !== 'undefined')
  watchEffect(() => (document.documentElement.lang = language.value))

// Dotted key paths into the message tree, e.g. "sell.search".
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]
export type MessageKey = Leaves<Messages>

function lookup(messages: unknown, key: string): string | undefined {
  let node = messages
  for (const part of key.split('.')) {
    if (node && typeof node === 'object') node = (node as Record<string, unknown>)[part]
    else return undefined
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * Translate a key. {name} placeholders are filled from params.
 * Plurals: "{n} item | {n} items" picks the first form for n = 1 (languages without
 * plural forms simply use one form).
 */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  let text = lookup(catalogs[language.value], key) ?? lookup(en, key) ?? key
  if (text.includes(' | ') && typeof params.n === 'number') {
    const [one, other] = text.split(' | ')
    text = (params.n === 1 ? one : other) ?? text
  }
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    params[name] !== undefined ? String(params[name]) : m,
  )
}

/** Date and time in the chosen language. */
export function formatDate(ts: number, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(intlLocale.value, options).format(ts)
  } catch {
    return new Date(ts).toLocaleString()
  }
}

export const fmtDateTime = (ts: number) =>
  formatDate(ts, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
export const fmtTime = (ts: number) => formatDate(ts, { hour: '2-digit', minute: '2-digit' })
export const fmtDay = (ts: number) =>
  formatDate(ts, { year: 'numeric', month: 'short', day: 'numeric' })
export const fmtFull = (ts: number) => formatDate(ts, { dateStyle: 'medium', timeStyle: 'short' })

/** For templates: `const { t } = useI18n()` keeps components reactive to language changes. */
export function useI18n() {
  return { t, language, languages, intlLocale }
}
