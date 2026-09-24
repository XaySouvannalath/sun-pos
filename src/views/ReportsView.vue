<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download } from 'lucide-vue-next'
import { useOrdersStore } from '@/stores/orders'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { downloadCsv, lineTotal, startOfDay } from '@/utils/pos'
import { canDownload } from '@/utils/env'
import type { PaymentMethod } from '@/types'

const orders = useOrdersStore()
const catalog = useCatalogStore()
const settings = useSettingsStore()

type Range = 'today' | 'yesterday' | '7' | '30'
const range = ref<Range>('today')
const ranges: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
]

const window_ = computed(() => {
  const today = startOfDay(Date.now())
  if (range.value === 'today') return { from: today, to: Infinity }
  if (range.value === 'yesterday') return { from: today - 86400000, to: today }
  return { from: today - (Number(range.value) - 1) * 86400000, to: Infinity }
})

const inRange = computed(() =>
  orders.orders.filter((o) => o.createdAt >= window_.value.from && o.createdAt < window_.value.to),
)
const completed = computed(() => inRange.value.filter((o) => o.status === 'completed'))

const kpi = computed(() => {
  const c = completed.value
  const net = c.reduce((s, o) => s + o.total, 0)
  const items = c.reduce((s, o) => s + o.itemCount, 0)
  const tax = c.reduce((s, o) => s + o.tax, 0)
  const discounts = c.reduce(
    (s, o) => s + o.discount + o.lines.reduce((x, l) => x + l.unitPrice * l.qty - lineTotal(l), 0),
    0,
  )
  // Profit estimate: revenue before tax/service minus current product cost.
  const cost = c.reduce(
    (s, o) =>
      s + o.lines.reduce((x, l) => x + (catalog.byId.get(l.productId)?.cost ?? 0) * l.qty, 0),
    0,
  )
  const revenue = c.reduce((s, o) => s + o.subtotal - o.discount, 0)
  const refunds = inRange.value.filter((o) => o.status === 'refunded')
  return {
    net,
    orders: c.length,
    avg: c.length ? net / c.length : 0,
    items,
    tax,
    discounts,
    profit: revenue - cost,
    margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0,
    refunds: refunds.reduce((s, o) => s + o.total, 0),
    refundCount: refunds.length,
  }
})

const chart = computed(() => {
  const hourly = range.value === 'today' || range.value === 'yesterday'
  const buckets: { label: string; value: number; count: number }[] = []
  if (hourly) {
    for (let h = 6; h <= 22; h++) buckets.push({ label: `${h}`, value: 0, count: 0 })
    for (const o of completed.value) {
      const b = buckets[new Date(o.createdAt).getHours() - 6]
      if (b) {
        b.value += o.total
        b.count++
      }
    }
  } else {
    const days = Number(range.value)
    for (let i = 0; i < days; i++) {
      const d = new Date(window_.value.from + i * 86400000)
      buckets.push({
        label: days > 7 ? `${d.getDate()}` : d.toLocaleDateString([], { weekday: 'short' }),
        value: 0,
        count: 0,
      })
    }
    for (const o of completed.value) {
      const b = buckets[Math.floor((startOfDay(o.createdAt) - window_.value.from) / 86400000)]
      if (b) {
        b.value += o.total
        b.count++
      }
    }
  }
  const max = Math.max(...buckets.map((b) => b.value), 1)
  return { hourly, buckets, max }
})

const products = computed(() => {
  const m = new Map<string, { name: string; emoji: string; qty: number; revenue: number }>()
  for (const o of completed.value)
    for (const l of o.lines) {
      const r = m.get(l.productId) ?? { name: l.name, emoji: l.emoji, qty: 0, revenue: 0 }
      r.qty += l.qty
      r.revenue += lineTotal(l)
      m.set(l.productId, r)
    }
  return [...m.values()].sort((a, b) => b.qty - a.qty)
})

function breakdown<K extends string>(key: (o: (typeof completed.value)[number]) => [K, number][]) {
  const m = new Map<K, number>()
  for (const o of completed.value) for (const [k, v] of key(o)) m.set(k, (m.get(k) ?? 0) + v)
  const total = [...m.values()].reduce((a, b) => a + b, 0) || 1
  return [...m.entries()]
    .map(([k, v]) => ({ key: k, value: v, pct: (v / total) * 100 }))
    .sort((a, b) => b.value - a.value)
}

const methodLabel: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  qr: 'QR / Transfer',
}
const byMethod = computed(() =>
  breakdown<PaymentMethod>((o) =>
    o.payments.map(
      (p) =>
        [p.method, p.method === 'cash' ? Math.max(p.amount - o.change, 0) : p.amount] as [
          PaymentMethod,
          number,
        ],
    ),
  ),
)
const byCategory = computed(() =>
  breakdown<string>((o) =>
    o.lines.map((l) => [catalog.categoryById.get(l.categoryId)?.name ?? 'Other', lineTotal(l)]),
  ),
)
const byType = computed(() => breakdown<string>((o) => [[o.orderType, o.total]]))
const byStaff = computed(() => breakdown<string>((o) => [[o.staffName || '—', o.total]]))

function exportProducts() {
  downloadCsv(`product-sales-${range.value}.csv`, [
    ['Product', 'Qty', 'Revenue'],
    ...products.value.map((p) => [p.name, p.qty, settings.round(p.revenue)]),
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
              rows: byMethod.map((r) => ({ ...r, label: methodLabel[r.key] })),
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
