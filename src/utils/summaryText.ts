// The daily summary as a plain-text message for WhatsApp, Telegram, LINE or email.
import { languages, tIn, type Language, type MessageKey } from '@/i18n'
import type { DailySummary, RiskAlert } from '@/types'

export interface TextOptions {
  lang: Language
  storeName: string
  money: (n: number) => string
}

/** One line per alert, in the chosen language. */
export function alertText(a: RiskAlert, lang: Language, money: (n: number) => string): string {
  return tIn(lang, `activity.alerts.${a.code}` as MessageKey, {
    name: a.staffName,
    amount: money(a.amount),
    n: a.count,
    pct: a.pct,
  })
}

export function summaryText(s: DailySummary, o: TextOptions): string {
  const t = (key: MessageKey, p: Record<string, string | number> = {}) => tIn(o.lang, key, p)
  const intl = languages.find((l) => l.id === o.lang)?.intl ?? 'en-US'
  const day = new Intl.DateTimeFormat(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${s.date}T12:00:00`))
  const time = (ts: number) =>
    new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit' }).format(ts)
  const change = (now: number, before: number) => {
    if (!before) return ''
    const pct = Math.round(((now - before) / before) * 100)
    return ` (${pct >= 0 ? '+' : ''}${pct}% ${t('summary.vsLastWeek')})`
  }

  const lines: string[] = []
  lines.push(`☀ ${o.storeName} · ${t('summary.title')}`)
  lines.push(day)
  lines.push('')
  lines.push(`${t('summary.sales')}: ${o.money(s.sales)}${change(s.sales, s.lastWeek.sales)}`)
  lines.push(
    `${t('summary.orders')}: ${s.orders}${change(s.orders, s.lastWeek.orders)} · ${t('summary.avg')}: ${o.money(s.avg)}`,
  )
  if (s.payments.length)
    lines.push(
      s.payments.map((p) => `${t(`payMethod.${p.method}`)} ${o.money(p.amount)}`).join(' · '),
    )

  if (s.top.length) {
    lines.push('')
    lines.push(`${t('summary.top')}:`)
    s.top.forEach((i, n) => lines.push(`${n + 1}. ${i.name} × ${i.qty}`))
  }

  if (s.shifts.length) {
    lines.push('')
    lines.push(`${t('summary.cash')}:`)
    for (const sh of s.shifts) {
      const when = `${time(sh.openedAt)}–${sh.closedAt ? time(sh.closedAt) : t('summary.stillOpen')}`
      if (sh.diff === null) lines.push(`• ${sh.staffName} ${when}`)
      else {
        const result =
          Math.abs(sh.diff) < 0.005
            ? t('summary.balanced')
            : sh.diff < 0
              ? t('summary.short', { amount: o.money(-sh.diff) })
              : t('summary.over', { amount: o.money(sh.diff) })
        lines.push(`• ${sh.staffName} ${when}: ${result}`)
      }
    }
  }

  const controls = [
    s.discounts ? `${t('summary.discounts')} ${o.money(s.discounts)}` : '',
    s.voids.count ? `${t('summary.voids')} ${s.voids.count} (${o.money(s.voids.value)})` : '',
    s.refunds.count
      ? `${t('summary.refunds')} ${s.refunds.count} (${o.money(s.refunds.value)})`
      : '',
    s.cashOut ? `${t('summary.cashOut')} ${o.money(s.cashOut)}` : '',
  ].filter(Boolean)
  if (controls.length) {
    lines.push('')
    lines.push(controls.join(' · '))
  }

  lines.push('')
  if (s.alerts.some((a) => a.level === 'warn')) {
    lines.push(`⚠ ${t('summary.check')}:`)
    for (const a of s.alerts) lines.push(`• ${alertText(a, o.lang, o.money)}`)
  } else lines.push(`✓ ${t('summary.allClear')}`)
  return lines.join('\n')
}
