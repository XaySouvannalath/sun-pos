<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  BadgePercent,
  CircleAlert,
  CircleCheck,
  Info,
  KeyRound,
  Printer,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Undo2,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Lock,
  Clock,
} from 'lucide-vue-next'
import { fmtDateTime, t, type MessageKey } from '@/i18n'
import { api } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { alertText } from '@/utils/summaryText'
import BranchSelect from '@/components/BranchSelect.vue'
import { startOfDay } from '@/utils/pos'
import { language } from '@/i18n'
import type { AuditEntry, AuditType, RiskReport } from '@/types'

const settings = useSettingsStore()

type Period = 'today' | 'yesterday' | 'week'
const period = ref<Period>('today')
const DAY = 86400000
const branch = ref('')
const range = computed(() => {
  const today = startOfDay(Date.now())
  const b = branch.value ? { branch: branch.value } : {}
  if (period.value === 'yesterday') return { from: today - DAY, to: today, ...b }
  if (period.value === 'week') return { from: today - 6 * DAY, to: today + DAY, ...b }
  return { from: today, to: today + DAY, ...b }
})

const report = ref<RiskReport | null>(null)
const log = ref<AuditEntry[]>([])
const total = ref(0)
const type = ref<AuditType | ''>('')
const staff = ref('')
const loading = ref(false)

async function load(more = false) {
  loading.value = true
  try {
    const q = {
      ...range.value,
      type: type.value || undefined,
      staff: staff.value || undefined,
      limit: 50,
      offset: more ? log.value.length : 0,
    }
    const [r, page] = await Promise.all([
      more ? Promise.resolve(report.value) : api.activity.risk(range.value),
      api.activity.log(q),
    ])
    report.value = r
    log.value = more ? [...log.value, ...page.items] : page.items
    total.value = page.total
  } finally {
    loading.value = false
  }
}
onMounted(() => load())
watch([period, type, staff, branch], () => load())

const warnings = computed(() => report.value?.alerts.filter((a) => a.level === 'warn') ?? [])
const infos = computed(() => report.value?.alerts.filter((a) => a.level === 'info') ?? [])
const staffNames = computed(() => report.value?.staff.map((s) => s.staffName) ?? [])

const types: AuditType[] = [
  'discount',
  'void',
  'orderDeleted',
  'refund',
  'cashOut',
  'cashIn',
  'reprint',
  'shiftClosed',
  'approvalFailed',
  'timeEdited',
]
const icons: Record<AuditType, typeof Info> = {
  discount: BadgePercent,
  void: Undo2,
  orderDeleted: Trash2,
  refund: RotateCcw,
  cashOut: ArrowUpFromLine,
  cashIn: ArrowDownToLine,
  reprint: Printer,
  shiftClosed: Lock,
  approvalFailed: KeyRound,
  timeEdited: Clock,
}
const typeLabel = (x: AuditType) => t(`activity.types.${x}` as MessageKey)
/** Types that look like money leaving: shown in the warning colour. */
const risky = new Set<AuditType>(['void', 'orderDeleted', 'refund', 'cashOut', 'approvalFailed'])

/** A wrong PIN records what it was for; show that in words. */
const detailText = (e: AuditEntry) =>
  e.type === 'approvalFailed'
    ? t(`approval.actions.${e.detail}` as MessageKey)
    : e.type === 'timeEdited'
      ? // Time corrections record exact times; show them in the local time and language.
        e.detail.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, (iso) => fmtDateTime(Date.parse(iso)))
      : e.detail

function amountText(e: AuditEntry) {
  if (e.type === 'approvalFailed' || e.type === 'timeEdited') return ''
  if (e.type === 'shiftClosed')
    return Math.abs(e.amount) < 0.005
      ? t('shift.balances')
      : e.amount < 0
        ? t('shift.short', { amount: settings.money(-e.amount) })
        : t('shift.over', { amount: settings.money(e.amount) })
  return settings.money(e.amount)
}

const lang = computed(() => language.value)
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex flex-1 items-center gap-2">
        <ShieldAlert class="size-7 text-primary" /> {{ t('activity.title') }}
      </h1>
      <BranchSelect v-model="branch" />
      <div class="segmented" role="group" :aria-label="t('activity.period')">
        <button
          v-for="p in ['today', 'yesterday', 'week'] as const"
          :key="p"
          :aria-pressed="period === p"
          @click="period = p"
        >
          {{ t(`activity.periods.${p}`) }}
        </button>
      </div>
    </div>
    <p class="max-w-3xl text-sm text-ink-muted">{{ t('activity.subtitle') }}</p>

    <!-- Warnings first -->
    <section class="grid gap-3 lg:grid-cols-2">
      <div
        v-if="report && !warnings.length"
        class="flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success lg:col-span-2"
      >
        <CircleCheck class="size-6 shrink-0" />
        <p class="font-semibold">{{ t('activity.allClear') }}</p>
      </div>
      <div
        v-for="(a, i) in warnings"
        :key="'w' + i"
        class="flex gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4"
      >
        <CircleAlert class="size-5 shrink-0 text-danger" />
        <p class="text-sm font-medium text-ink">{{ alertText(a, lang, settings.money) }}</p>
      </div>
      <div
        v-for="(a, i) in infos"
        :key="'i' + i"
        class="flex gap-3 rounded-2xl border border-line bg-surface p-4"
      >
        <Info class="size-5 shrink-0 text-ink-muted" />
        <p class="text-sm text-ink">{{ alertText(a, lang, settings.money) }}</p>
      </div>
    </section>

    <!-- Per staff -->
    <section v-if="report?.staff.length" class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('activity.cols.staff') }}</th>
            <th class="text-right">{{ t('activity.cols.sales') }}</th>
            <th class="text-right">{{ t('activity.cols.discounts') }}</th>
            <th class="text-right">{{ t('activity.cols.voids') }}</th>
            <th class="text-right">{{ t('activity.cols.refunds') }}</th>
            <th class="text-right">{{ t('activity.cols.cashOut') }}</th>
            <th class="text-right">{{ t('activity.cols.deleted') }}</th>
            <th class="text-right">{{ t('activity.cols.overShort') }}</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr
            v-for="s in report.staff"
            :key="s.staffName"
            :class="s.flagged && 'bg-danger-soft/50'"
          >
            <td class="font-semibold">
              <button class="text-left hover:underline" @click="staff = s.staffName">
                {{ s.staffName }}
              </button>
              <CircleAlert v-if="s.flagged" class="ml-1 inline size-4 text-danger" />
              <span class="block text-xs font-normal text-ink-muted">{{
                t('orders.count', { n: s.orders })
              }}</span>
            </td>
            <td class="text-right">{{ settings.money(s.sales) }}</td>
            <td class="text-right">
              {{ settings.money(s.discounts) }}
              <span class="block text-xs text-ink-muted">×{{ s.discountCount }}</span>
            </td>
            <td class="text-right">
              {{ settings.money(s.voids) }}
              <span class="block text-xs text-ink-muted">×{{ s.voidCount }}</span>
            </td>
            <td class="text-right">
              {{ settings.money(s.refunds) }}
              <span class="block text-xs text-ink-muted">×{{ s.refundCount }}</span>
            </td>
            <td class="text-right">{{ settings.money(s.cashOut) }}</td>
            <td class="text-right">{{ settings.money(s.deleted) }}</td>
            <td
              class="text-right font-semibold"
              :class="s.overShort < 0 ? 'text-danger' : s.overShort > 0 ? 'text-accent' : ''"
            >
              {{ settings.money(s.overShort) }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Log -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="flex-1 text-lg font-semibold">{{ t('activity.log') }}</h2>
        <select v-model="type" class="input h-10 w-auto" :aria-label="t('activity.filterType')">
          <option value="">{{ t('activity.allTypes') }}</option>
          <option v-for="x in types" :key="x" :value="x">{{ typeLabel(x) }}</option>
        </select>
        <select v-model="staff" class="input h-10 w-auto" :aria-label="t('activity.filterStaff')">
          <option value="">{{ t('activity.allStaff') }}</option>
          <option v-for="n in staffNames" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <ul v-if="log.length" class="card divide-y divide-line/70">
        <li v-for="e in log" :key="e.id" class="flex items-start gap-3 px-4 py-3">
          <span
            class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl"
            :class="
              risky.has(e.type) ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-ink-muted'
            "
          >
            <component :is="icons[e.type]" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <b>{{ typeLabel(e.type) }}</b>
              <span class="text-ink-muted"> · {{ e.staffName }}</span>
              <span v-if="e.orderNumber" class="text-ink-muted">
                · <ReceiptText class="inline size-3.5" /> #{{ e.orderNumber }}</span
              >
              <span v-if="e.table" class="text-ink-muted">
                · {{ t('cart.tableN', { n: e.table }) }}</span
              >
            </p>
            <p v-if="e.detail" class="truncate text-sm text-ink-muted">{{ detailText(e) }}</p>
            <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {{ fmtDateTime(e.at) }}
              <span v-if="e.approvedBy" class="badge bg-primary-soft text-primary">
                <KeyRound class="size-3" /> {{ t('activity.approvedBy', { name: e.approvedBy }) }}
              </span>
            </p>
          </div>
          <span
            class="text-sm font-semibold whitespace-nowrap tabular-nums"
            :class="
              e.type === 'shiftClosed' && e.amount < 0
                ? 'text-danger'
                : risky.has(e.type)
                  ? 'text-danger'
                  : ''
            "
            >{{ amountText(e) }}</span
          >
        </li>
      </ul>
      <p v-else-if="!loading" class="card p-10 text-center text-sm text-ink-muted">
        <Wallet class="mx-auto mb-2 size-8 opacity-40" />
        {{ t('activity.empty') }}
      </p>
      <button
        v-if="log.length < total"
        class="btn btn-soft w-full"
        :disabled="loading"
        @click="load(true)"
      >
        {{ t('common.showMore') }}
      </button>
    </section>
  </div>
</template>
