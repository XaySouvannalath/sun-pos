<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fmtDateTime as fmtTime, t } from '@/i18n'
import { Search, Printer, RotateCcw, Download } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import OrderReceipt from '@/components/OrderReceipt.vue'
import { api } from '@/api'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useCustomersStore } from '@/stores/customers'
import { useToastStore } from '@/stores/toast'
import { startOfDay } from '@/utils/pos'
import { downloadCsv } from '@/utils/download'
import { canDownload, canPrint } from '@/utils/env'
import type { Order } from '@/types'

const PAGE = 50

const orders = useOrdersStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const customers = useCustomersStore()
const toast = useToastStore()

const q = ref('')
const status = ref<'all' | 'completed' | 'refunded'>('all')
const range = ref<'today' | '7' | '30' | 'all'>('today')
const selected = ref<Order | null>(null)
const refundOpen = ref(false)
const refundReason = ref('')
const restock = ref(true)
const loading = ref(false)

// The server filters and pages the orders; this view shows what has been loaded so far.
const filtered = ref<Order[]>([])
const total = ref(0)

function filters() {
  const from =
    range.value === 'today'
      ? startOfDay(Date.now())
      : range.value === 'all'
        ? undefined
        : Date.now() - Number(range.value) * 86400000
  return {
    from,
    status: status.value === 'all' ? undefined : status.value,
    q: q.value.trim() || undefined,
  }
}

let seq = 0
async function load(append = false) {
  const mine = ++seq
  loading.value = true
  try {
    const page = await api.orders.list({
      ...filters(),
      limit: PAGE,
      offset: append ? filtered.value.length : 0,
    })
    if (mine !== seq) return // a newer search already replaced this one
    filtered.value = append ? [...filtered.value, ...page.items] : page.items
    total.value = page.total
  } finally {
    if (mine === seq) loading.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
watch([status, range], () => load())
onMounted(() => load())

const allLoaded = computed(() => filtered.value.length >= total.value)
const totalShown = computed(() =>
  filtered.value.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0),
)

const detailOpen = computed({
  get: () => !!selected.value,
  set: (v) => {
    if (!v) selected.value = null
  },
})

const print = () => window.print()

async function doRefund() {
  if (!selected.value) return
  const updated = await orders.refund(selected.value.id, refundReason.value.trim(), restock.value)
  toast.show(t('orders.refunded', { n: updated.number }), 'success')
  selected.value = updated
  const i = filtered.value.findIndex((o) => o.id === updated.id)
  if (i >= 0) filtered.value[i] = updated
  refundOpen.value = false
  refundReason.value = ''
}

async function exportCsv() {
  // Fetch every matching order, not just the loaded page.
  const all: Order[] = []
  for (;;) {
    const page = await api.orders.list({ ...filters(), limit: 500, offset: all.length })
    all.push(...page.items)
    if (!page.items.length || all.length >= page.total) break
  }
  const rows: (string | number)[][] = [
    [
      t('orders.csv.number'),
      t('orders.csv.date'),
      t('orders.csv.type'),
      t('orders.csv.table'),
      t('orders.csv.customer'),
      t('orders.csv.staff'),
      t('orders.csv.items'),
      t('receipt.subtotal'),
      t('cart.discount'),
      t('receipt.service'),
      t('orders.csv.tax'),
      t('common.total'),
      t('orders.csv.payment'),
      t('orders.csv.status'),
    ],
  ]
  for (const o of all)
    rows.push([
      o.number,
      new Date(o.createdAt).toISOString(),
      o.orderType,
      o.table,
      o.customerId ? (customers.byId.get(o.customerId)?.name ?? '') : '',
      o.staffName,
      o.lines.map((l) => `${l.qty}x ${l.name}`).join('; '),
      o.subtotal,
      o.discount,
      o.service,
      o.tax,
      o.total,
      o.payments.map((p) => p.method).join('+'),
      o.status,
    ])
  downloadCsv(`orders-${new Date().toISOString().slice(0, 10)}.csv`, rows)
}
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">{{ t('nav.orders') }}</h1>
      <button v-if="canDownload" class="btn btn-outline btn-sm" @click="exportCsv">
        <Download class="size-4" /> {{ t('orders.exportCsv') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-3">
      <div class="relative min-w-60 flex-1">
        <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
        <input
          v-model="q"
          class="input pl-10"
          :placeholder="t('orders.searchPlaceholder')"
          :aria-label="t('orders.searchLabel')"
        />
      </div>
      <div class="segmented">
        <button
          v-for="r in ['today', '7', '30', 'all'] as const"
          :key="r"
          class="px-3"
          :aria-pressed="range === r"
          @click="range = r"
        >
          {{
            r === 'today'
              ? t('range.today')
              : r === 'all'
                ? t('common.all')
                : t('range.days', { n: r })
          }}
        </button>
      </div>
      <div class="segmented">
        <button
          v-for="s in ['all', 'completed', 'refunded'] as const"
          :key="s"
          class="px-3"
          :aria-pressed="status === s"
          @click="status = s"
        >
          {{ t(`orders.status.${s}`) }}
        </button>
      </div>
    </div>

    <p class="text-sm text-ink-muted">
      {{ t('orders.count', { n: total })
      }}<template v-if="allLoaded">
        · {{ t('orders.netSales') }}
        <b class="text-ink">{{ settings.money(totalShown) }}</b></template
      ><span v-if="loading"> · {{ t('common.loading') }}</span>
    </p>

    <div class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ t('orders.col.time') }}</th>
            <th class="hidden md:table-cell">{{ t('orders.csv.items') }}</th>
            <th class="hidden sm:table-cell">{{ t('orders.csv.type') }}</th>
            <th class="hidden lg:table-cell">{{ t('orders.csv.staff') }}</th>
            <th>{{ t('orders.csv.payment') }}</th>
            <th class="text-right">{{ t('common.total') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in filtered"
            :key="o.id"
            class="cursor-pointer hover:bg-surface-2/60"
            @click="selected = o"
          >
            <td class="font-semibold">#{{ o.number }}</td>
            <td class="whitespace-nowrap text-ink-muted">{{ fmtTime(o.createdAt) }}</td>
            <td class="hidden max-w-72 truncate md:table-cell">
              {{ o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') }}
            </td>
            <td class="hidden sm:table-cell">
              {{ t(`orderType.${o.orderType}`)
              }}<span v-if="o.table" class="text-ink-muted">
                · {{ t('receipt.table', { n: o.table }) }}</span
              >
            </td>
            <td class="hidden text-ink-muted lg:table-cell">{{ o.staffName }}</td>
            <td>
              <span class="text-ink-muted">{{
                o.payments.map((p) => t(`payMethod.${p.method}`)).join(' + ')
              }}</span>
              <span v-if="o.status === 'refunded'" class="badge ml-2 bg-danger-soft text-danger">{{
                t('orders.status.refunded')
              }}</span>
            </td>
            <td
              class="text-right font-semibold"
              :class="o.status === 'refunded' && 'text-ink-muted line-through'"
            >
              {{ settings.money(o.total) }}
            </td>
          </tr>
          <tr v-if="!filtered.length && !loading">
            <td colspan="7" class="py-12 text-center text-ink-muted">{{ t('orders.none') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!allLoaded" class="text-center">
      <button class="btn btn-soft" :disabled="loading" @click="load(true)">
        {{ t('common.showMore') }}
      </button>
    </div>

    <BaseModal
      v-model="detailOpen"
      :title="selected ? t('receipt.order', { n: selected.number }) : ''"
      size="md"
    >
      <div v-if="selected" class="rounded-2xl bg-surface-2 p-4">
        <OrderReceipt :order="selected" />
      </div>
      <p v-if="selected?.refund" class="mt-3 text-sm text-ink-muted">
        {{ t('orders.refundedBy', { time: fmtTime(selected.refund.at), name: selected.refund.by })
        }}<template v-if="selected.refund.reason">: “{{ selected.refund.reason }}”</template>
      </p>
      <template #footer>
        <button v-if="canPrint" class="btn btn-soft flex-1" @click="print">
          <Printer class="size-4" /> {{ t('orders.reprint') }}
        </button>
        <button
          v-if="selected?.status === 'completed' && auth.isAdmin"
          class="btn btn-danger flex-1"
          @click="refundOpen = true"
        >
          <RotateCcw class="size-4" /> {{ t('orders.refund') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="refundOpen" :title="t('orders.refundTitle')" size="sm">
      <div v-if="selected" class="space-y-4">
        <p class="text-sm">
          {{
            t('orders.refundConfirm', {
              amount: settings.money(selected.total),
              n: selected.number,
            })
          }}
          <span v-if="selected.payments.some((p) => p.method === 'cash')" class="text-ink-muted">
            {{ t('orders.cashRefundNote') }}</span
          >
        </p>
        <div>
          <label class="label" for="reason">{{ t('fields.reason') }}</label>
          <input
            id="reason"
            v-model="refundReason"
            class="input"
            :placeholder="t('orders.reasonPlaceholder')"
          />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="restock" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
          {{ t('orders.restock') }}
        </label>
      </div>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="refundOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="doRefund">
          {{ t('orders.confirmRefund') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
