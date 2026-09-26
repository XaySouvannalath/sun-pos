<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDate, t } from '@/i18n'
import { Download } from 'lucide-vue-next'
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue'
import { api } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import BranchSelect from '@/components/BranchSelect.vue'
import { startOfDay } from '@/utils/pos'
import { downloadCsv } from '@/utils/download'
import { canDownload } from '@/utils/env'
import type {
  BreakdownRow,
  OrderType,
  PaymentMethod,
  ProductSales,
  ReportSummary,
  SalesBucket,
} from '@/types'

const settings = useSettingsStore()
/** Which branch the reports cover: this till's (default), another, or 'all'. */
const branch = ref('')

type Range = 'today' | 'yesterday' | '7' | '30'
const range = ref<Range>('today')
const ranges = computed<{ id: Range; label: string }[]>(() => [
  { id: 'today', label: t('range.today') },
  { id: 'yesterday', label: t('range.yesterday') },
  { id: '7', label: t('range.days', { n: 7 }) },
  { id: '30', label: t('range.days', { n: 30 }) },
])

const DAY = 86400000
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

// Day boundaries are worked out here, in the shop's local time, and sent to the server.
function window_() {
  const today = startOfDay(Date.now())
  const b = branch.value ? { branch: branch.value } : {}
  if (range.value === 'today') return { from: today, to: today + DAY, ...b }
  if (range.value === 'yesterday') return { from: today - DAY, to: today, ...b }
  return { from: today - (Number(range.value) - 1) * DAY, to: today + DAY, ...b }
}

const emptySummary: ReportSummary = {
  net: 0,
  orders: 0,
  avg: 0,
  items: 0,
  tax: 0,
  discounts: 0,
  profit: 0,
  margin: 0,
  refunds: 0,
  refundCount: 0,
}
const kpi = ref<ReportSummary>(emptySummary)
const buckets = ref<SalesBucket[]>([])
const products = ref<ProductSales[]>([])
const byMethod = ref<BreakdownRow[]>([])
const byCategory = ref<BreakdownRow[]>([])
const byType = ref<BreakdownRow[]>([])
const byStaff = ref<BreakdownRow[]>([])
const byBranch = ref<BreakdownRow[]>([])
const loading = ref(false)

let seq = 0
async function load() {
  const mine = ++seq
  const w = window_()
  const hourly = range.value === 'today' || range.value === 'yesterday'
  loading.value = true
  try {
    const [summary, time, prods, pay, cat, type, staff, branches] = await Promise.all([
      api.reports.summary(w),
      api.reports.salesByTime({ ...w, bucket: hourly ? 'hour' : 'day', tz: timeZone }),
      api.reports.products({ ...w, limit: 100 }),
      api.reports.breakdown({ ...w, by: 'payment' }),
      api.reports.breakdown({ ...w, by: 'category' }),
      api.reports.breakdown({ ...w, by: 'orderType' }),
      api.reports.breakdown({ ...w, by: 'staff' }),
      branch.value === 'all' ? api.reports.breakdown({ ...w, by: 'branch' }) : Promise.resolve([]),
    ])
    if (mine !== seq) return
    kpi.value = summary
    buckets.value = time
    products.value = prods
    byMethod.value = pay
    byCategory.value = cat
    byType.value = type
    byStaff.value = staff
    byBranch.value = branches
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch([range, branch], load, { immediate: true })

const chart = computed(() => {
  const hourly = range.value === 'today' || range.value === 'yesterday'
  const days = buckets.value.length
  const list = buckets.value.map((b) => ({
    ...b,
    label: hourly
      ? b.label
      : days > 7
        ? String(new Date(b.start).getDate())
        : formatDate(b.start, { weekday: 'short' }),
  }))
  const max = Math.max(...list.map((b) => b.value), 1)
  return { hourly, buckets: list, max }
})

const methodLabel = (m: string) => t(`payMethod.${m as PaymentMethod}`)

function exportProducts() {
  downloadCsv(`product-sales-${range.value}.csv`, [
    ['Product', 'Qty', 'Revenue'],
    ...products.value.map((p) => [p.name, p.qty, p.revenue]),
  ])
}
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">{{ t('nav.reports') }}</h1>
      <BranchSelect v-model="branch" />
      <div class="segmented">
        <button
          v-for="r in ranges"
          :key="r.id"
          class="px-3"
          :aria-pressed="range === r.id"
          @click="range = r.id"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('reports.netSales') }}</p>
        <p class="text-2xl font-bold">
          <AnimatedNumber :value="kpi.net" :format="settings.money" from-zero :duration="600" />
        </p>
        <p class="text-xs text-ink-muted">
          {{
            t('reports.inclTax', { label: settings.s.taxLabel, amount: settings.money(kpi.tax) })
          }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('nav.orders') }}</p>
        <p class="text-2xl font-bold">
          <AnimatedNumber :value="kpi.orders" from-zero :duration="600" />
        </p>
        <p class="text-xs text-ink-muted">{{ t('reports.itemsSold', { n: kpi.items }) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('reports.avgOrder') }}</p>
        <p class="text-2xl font-bold">
          <AnimatedNumber :value="kpi.avg" :format="settings.money" from-zero :duration="600" />
        </p>
        <p class="text-xs text-ink-muted">
          {{ t('reports.discounts', { amount: settings.money(kpi.discounts) }) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('reports.profit') }}</p>
        <p class="text-2xl font-bold text-success">
          <AnimatedNumber :value="kpi.profit" :format="settings.money" from-zero :duration="600" />
        </p>
        <p class="text-xs text-ink-muted">
          {{
            t('reports.marginRefunds', {
              margin: kpi.margin,
              amount: settings.money(kpi.refunds),
              n: kpi.refundCount,
            })
          }}
        </p>
      </div>
    </div>

    <div class="card p-5">
      <h2 class="mb-4 font-semibold">
        {{ chart.hourly ? t('reports.byHour') : t('reports.byDay') }}
      </h2>
      <div class="flex h-52 items-end gap-1 sm:gap-2">
        <div
          v-for="(b, bi) in chart.buckets"
          :key="b.label"
          class="group flex h-full flex-1 flex-col items-center justify-end gap-1"
        >
          <span class="text-[10px] text-ink-muted opacity-0 transition group-hover:opacity-100">{{
            settings.money(b.value)
          }}</span>
          <div
            class="anim-grow-y w-full rounded-t-md bg-primary/70 transition-[height,background-color] duration-500 group-hover:bg-primary"
            :style="{
              height: `${(b.value / chart.max) * 100}%`,
              minHeight: b.value ? '4px' : '0',
              '--i': bi,
            }"
            :title="`${b.label}: ${settings.money(b.value)} · ${t('orders.count', { n: b.count })}`"
          />
          <span class="text-[10px] text-ink-muted">{{ b.label }}</span>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card p-5">
        <div class="mb-3 flex items-center">
          <h2 class="flex-1 font-semibold">{{ t('reports.bestSelling') }}</h2>
          <button v-if="canDownload" class="btn btn-ghost btn-sm" @click="exportProducts">
            <Download class="size-4" /> CSV
          </button>
        </div>
        <ol class="space-y-2">
          <li
            v-for="(p, i) in products.slice(0, 10)"
            :key="p.name"
            class="flex items-center gap-3 text-sm"
          >
            <span class="w-5 text-right font-semibold text-ink-muted">{{ i + 1 }}</span>
            <span class="text-lg">{{ p.emoji }}</span>
            <span class="flex-1 truncate">{{ p.name }}</span>
            <span class="text-ink-muted">{{ t('sell.sold', { n: p.qty }) }}</span>
            <span class="w-24 text-right font-semibold">{{ settings.money(p.revenue) }}</span>
          </li>
          <li v-if="!products.length" class="py-6 text-center text-sm text-ink-muted">
            {{ t('reports.noSales') }}
          </li>
        </ol>
      </div>

      <div class="space-y-4">
        <div
          v-for="block in [
            {
              title: t('reports.paymentMethods'),
              rows: byMethod.map((r) => ({ ...r, label: methodLabel(r.key) })),
            },
            {
              title: t('reports.byCategory'),
              rows: byCategory.map((r) => ({ ...r, label: r.key })),
            },
          ]"
          :key="block.title"
          class="card p-5"
        >
          <h2 class="mb-3 font-semibold">{{ block.title }}</h2>
          <div v-for="r in block.rows" :key="r.label" class="mb-2.5">
            <div class="mb-1 flex justify-between text-sm">
              <span>{{ r.label }}</span
              ><span class="font-semibold"
                >{{ settings.money(r.value) }}
                <span class="font-normal text-ink-muted">· {{ Math.round(r.pct) }}%</span></span
              >
            </div>
            <div class="h-2 rounded-full bg-surface-2">
              <div
                class="anim-grow-x h-2 rounded-full bg-primary/70 transition-[width] duration-500"
                :style="{ width: `${r.pct}%` }"
              />
            </div>
          </div>
          <p v-if="!block.rows.length" class="text-sm text-ink-muted">{{ t('reports.noData') }}</p>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div
        v-for="block in [
          {
            title: t('reports.orderTypes'),
            rows: byType.map((r) => ({ ...r, label: t(`orderType.${r.key as OrderType}`) })),
          },
          { title: t('reports.byStaff'), rows: byStaff.map((r) => ({ ...r, label: r.key })) },
          ...(branch === 'all'
            ? [
                {
                  title: t('branches.byBranch'),
                  rows: byBranch.map((r) => ({ ...r, label: r.key })),
                },
              ]
            : []),
        ]"
        :key="block.title"
        class="card p-5"
      >
        <h2 class="mb-3 font-semibold">{{ block.title }}</h2>
        <div v-for="r in block.rows" :key="r.key" class="mb-2.5">
          <div class="mb-1 flex justify-between text-sm">
            <span>{{ r.label }}</span
            ><span class="font-semibold">{{ settings.money(r.value) }}</span>
          </div>
          <div class="h-2 rounded-full bg-surface-2">
            <div
              class="anim-grow-x h-2 rounded-full bg-accent/70 transition-[width] duration-500"
              :style="{ width: `${r.pct}%` }"
            />
          </div>
        </div>
        <p v-if="!block.rows.length" class="text-sm text-ink-muted">{{ t('reports.noData') }}</p>
      </div>
    </div>
  </div>
</template>
