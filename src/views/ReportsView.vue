<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Download } from 'lucide-vue-next'
import { api } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { startOfDay } from '@/utils/pos'
import { downloadCsv } from '@/utils/download'
import { canDownload } from '@/utils/env'
import type { BreakdownRow, PaymentMethod, ProductSales, ReportSummary, SalesBucket } from '@/types'

const settings = useSettingsStore()

type Range = 'today' | 'yesterday' | '7' | '30'
const range = ref<Range>('today')
const ranges: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
]

const DAY = 86400000
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

// Day boundaries are worked out here, in the shop's local time, and sent to the server.
function window_() {
  const today = startOfDay(Date.now())
  if (range.value === 'today') return { from: today, to: today + DAY }
  if (range.value === 'yesterday') return { from: today - DAY, to: today }
  return { from: today - (Number(range.value) - 1) * DAY, to: today + DAY }
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
const loading = ref(false)

let seq = 0
async function load() {
  const mine = ++seq
  const w = window_()
  const hourly = range.value === 'today' || range.value === 'yesterday'
  loading.value = true
  try {
    const [summary, time, prods, pay, cat, type, staff] = await Promise.all([
      api.reports.summary(w),
      api.reports.salesByTime({ ...w, bucket: hourly ? 'hour' : 'day', tz: timeZone }),
      api.reports.products({ ...w, limit: 100 }),
      api.reports.breakdown({ ...w, by: 'payment' }),
      api.reports.breakdown({ ...w, by: 'category' }),
      api.reports.breakdown({ ...w, by: 'orderType' }),
      api.reports.breakdown({ ...w, by: 'staff' }),
    ])
    if (mine !== seq) return
    kpi.value = summary
    buckets.value = time
    products.value = prods
    byMethod.value = pay
    byCategory.value = cat
    byType.value = type
    byStaff.value = staff
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(range, load, { immediate: true })

const chart = computed(() => {
  const hourly = range.value === 'today' || range.value === 'yesterday'
  const days = buckets.value.length
  const list = buckets.value.map((b) => ({
    ...b,
    label: hourly
      ? b.label
      : days > 7
        ? String(new Date(b.start).getDate())
        : new Date(b.start).toLocaleDateString([], { weekday: 'short' }),
  }))
  const max = Math.max(...list.map((b) => b.value), 1)
  return { hourly, buckets: list, max }
})

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  qr: 'QR / Transfer',
}

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
      <h1 class="page-title flex-1">Reports</h1>
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
        <p class="text-xs text-ink-muted">Net sales</p>
        <p class="text-2xl font-bold">{{ settings.money(kpi.net) }}</p>
        <p class="text-xs text-ink-muted">
          incl. {{ settings.s.taxLabel }} {{ settings.money(kpi.tax) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">Orders</p>
        <p class="text-2xl font-bold">{{ kpi.orders }}</p>
        <p class="text-xs text-ink-muted">{{ kpi.items }} items sold</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">Average order</p>
        <p class="text-2xl font-bold">{{ settings.money(kpi.avg) }}</p>
        <p class="text-xs text-ink-muted">discounts {{ settings.money(kpi.discounts) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">Est. gross profit</p>
        <p class="text-2xl font-bold text-success">{{ settings.money(kpi.profit) }}</p>
        <p class="text-xs text-ink-muted">
          {{ kpi.margin }}% margin · refunds {{ settings.money(kpi.refunds) }} ({{
            kpi.refundCount
          }})
        </p>
      </div>
    </div>

    <div class="card p-5">
      <h2 class="mb-4 font-semibold">Sales by {{ chart.hourly ? 'hour' : 'day' }}</h2>
      <div class="flex h-52 items-end gap-1 sm:gap-2">
        <div
          v-for="b in chart.buckets"
          :key="b.label"
          class="group flex h-full flex-1 flex-col items-center justify-end gap-1"
        >
          <span class="text-[10px] text-ink-muted opacity-0 transition group-hover:opacity-100">{{
            settings.money(b.value)
          }}</span>
          <div
            class="w-full rounded-t-md bg-primary/70 transition group-hover:bg-primary"
            :style="{ height: `${(b.value / chart.max) * 100}%`, minHeight: b.value ? '4px' : '0' }"
            :title="`${b.label}: ${settings.money(b.value)} · ${b.count} orders`"
          />
          <span class="text-[10px] text-ink-muted">{{ b.label }}</span>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card p-5">
        <div class="mb-3 flex items-center">
          <h2 class="flex-1 font-semibold">Best-selling products</h2>
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
            <span class="text-ink-muted">{{ p.qty }} sold</span>
            <span class="w-24 text-right font-semibold">{{ settings.money(p.revenue) }}</span>
          </li>
          <li v-if="!products.length" class="py-6 text-center text-sm text-ink-muted">
            No sales in this period.
          </li>
        </ol>
      </div>

      <div class="space-y-4">
        <div
          v-for="block in [
            {
              title: 'Payment methods',
              rows: byMethod.map((r) => ({ ...r, label: methodLabel[r.key as PaymentMethod] })),
            },
            { title: 'Sales by category', rows: byCategory.map((r) => ({ ...r, label: r.key })) },
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
              <div class="h-2 rounded-full bg-primary/70" :style="{ width: `${r.pct}%` }" />
            </div>
          </div>
          <p v-if="!block.rows.length" class="text-sm text-ink-muted">No data.</p>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div
        v-for="block in [
          { title: 'Order types', rows: byType },
          { title: 'Sales by staff', rows: byStaff },
        ]"
        :key="block.title"
        class="card p-5"
      >
        <h2 class="mb-3 font-semibold">{{ block.title }}</h2>
        <div v-for="r in block.rows" :key="r.key" class="mb-2.5">
          <div class="mb-1 flex justify-between text-sm">
            <span class="capitalize">{{ r.key.replace('-', ' ') }}</span
            ><span class="font-semibold">{{ settings.money(r.value) }}</span>
          </div>
          <div class="h-2 rounded-full bg-surface-2">
            <div class="h-2 rounded-full bg-accent/70" :style="{ width: `${r.pct}%` }" />
          </div>
        </div>
        <p v-if="!block.rows.length" class="text-sm text-ink-muted">No data.</p>
      </div>
    </div>
  </div>
</template>
