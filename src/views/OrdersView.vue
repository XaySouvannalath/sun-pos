<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Printer, RotateCcw, Download } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import OrderReceipt from '@/components/OrderReceipt.vue'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useCustomersStore } from '@/stores/customers'
import { useToastStore } from '@/stores/toast'
import { downloadCsv, startOfDay } from '@/utils/pos'
import type { Order } from '@/types'

const orders = useOrdersStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const customers = useCustomersStore()
const toast = useToastStore()

const q = ref('')
const status = ref<'all' | 'completed' | 'refunded'>('all')
const range = ref<'today' | '7' | '30' | 'all'>('today')
const selectedId = ref<string | null>(null)
const refundOpen = ref(false)
const refundReason = ref('')
const restock = ref(true)
const limit = ref(50)

const filtered = computed(() => {
  const since =
    range.value === 'today'
      ? startOfDay(Date.now())
      : range.value === 'all'
        ? 0
        : Date.now() - Number(range.value) * 86400000
  const s = q.value.trim().toLowerCase()
  return orders.orders.filter((o) => {
    if (o.createdAt < since) return false
    if (status.value !== 'all' && o.status !== status.value) return false
    if (!s) return true
    const cust = o.customerId ? (customers.byId.get(o.customerId)?.name ?? '') : ''
    return (
      String(o.number) === s.replace('#', '') ||
      o.table.toLowerCase() === s ||
      cust.toLowerCase().includes(s) ||
      o.staffName.toLowerCase().includes(s) ||
      o.lines.some((l) => l.name.toLowerCase().includes(s))
    )
  })
})

const selected = computed(() => (selectedId.value ? orders.byId.get(selectedId.value) : undefined))
const detailOpen = computed({
  get: () => !!selected.value,
  set: (v) => {
    if (!v) selectedId.value = null
  },
})

const totalShown = computed(() =>
  filtered.value.filter((o) => o.status === 'completed').reduce((s, o) => s + o.total, 0),
)

const methodLabel = { cash: 'Cash', card: 'Card', qr: 'QR' }
const typeLabel = { 'dine-in': 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery' }
const fmtTime = (t: number) =>
  new Date(t).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const print = () => window.print()

function doRefund() {
  if (!selected.value) return
  orders.refund(selected.value.id, refundReason.value.trim(), restock.value)
  toast.show(`Order #${selected.value.number} refunded`, 'success')
  refundOpen.value = false
  refundReason.value = ''
}

function exportCsv() {
  const rows: (string | number)[][] = [
    [
      'Number',
      'Date',
      'Type',
      'Table',
      'Customer',
      'Staff',
      'Items',
      'Subtotal',
      'Discount',
      'Service',
      'Tax',
      'Total',
      'Payment',
      'Status',
    ],
  ]
  for (const o of filtered.value as Order[])
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
      <h1 class="page-title flex-1">Orders</h1>
      <button class="btn btn-outline btn-sm" @click="exportCsv">
        <Download class="size-4" /> Export CSV
      </button>
    </div>

    <div class="flex flex-wrap gap-3">
      <div class="relative min-w-60 flex-1">
        <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
        <input
          v-model="q"
          class="input pl-10"
          placeholder="Order #, table, customer, item, staff"
          aria-label="Search orders"
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
          {{ r === 'today' ? 'Today' : r === 'all' ? 'All' : `${r} days` }}
        </button>
      </div>
      <div class="segmented">
        <button
          v-for="s in ['all', 'completed', 'refunded'] as const"
          :key="s"
          class="px-3 capitalize"
          :aria-pressed="status === s"
          @click="status = s"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <p class="text-sm text-ink-muted">
      {{ filtered.length }} orders · net sales
      <b class="text-ink">{{ settings.money(totalShown) }}</b>
    </p>

    <div class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th class="hidden md:table-cell">Items</th>
            <th class="hidden sm:table-cell">Type</th>
            <th class="hidden lg:table-cell">Staff</th>
            <th>Payment</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="o in filtered.slice(0, limit)"
            :key="o.id"
            class="cursor-pointer hover:bg-surface-2/60"
            @click="selectedId = o.id"
          >
            <td class="font-semibold">#{{ o.number }}</td>
            <td class="whitespace-nowrap text-ink-muted">{{ fmtTime(o.createdAt) }}</td>
            <td class="hidden max-w-72 truncate md:table-cell">
              {{ o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ') }}
            </td>
            <td class="hidden sm:table-cell">
              {{ typeLabel[o.orderType]
              }}<span v-if="o.table" class="text-ink-muted"> · T{{ o.table }}</span>
            </td>
            <td class="hidden text-ink-muted lg:table-cell">{{ o.staffName }}</td>
            <td>
              <span class="text-ink-muted">{{
                o.payments.map((p) => methodLabel[p.method]).join(' + ')
              }}</span>
              <span v-if="o.status === 'refunded'" class="badge ml-2 bg-danger-soft text-danger"
                >Refunded</span
              >
            </td>
            <td
              class="text-right font-semibold"
              :class="o.status === 'refunded' && 'text-ink-muted line-through'"
            >
              {{ settings.money(o.total) }}
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="7" class="py-12 text-center text-ink-muted">No orders found.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="filtered.length > limit" class="text-center">
      <button class="btn btn-soft" @click="limit += 50">Show more</button>
    </div>

    <BaseModal v-model="detailOpen" :title="selected ? `Order #${selected.number}` : ''" size="md">
      <div v-if="selected" class="rounded-2xl bg-surface-2 p-4">
        <OrderReceipt :order="selected" />
      </div>
      <p v-if="selected?.refund" class="mt-3 text-sm text-ink-muted">
        Refunded {{ fmtTime(selected.refund.at) }} by {{ selected.refund.by
        }}<template v-if="selected.refund.reason">: “{{ selected.refund.reason }}”</template>
      </p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="print">
          <Printer class="size-4" /> Reprint
        </button>
        <button
          v-if="selected?.status === 'completed' && auth.isAdmin"
          class="btn btn-danger flex-1"
          @click="refundOpen = true"
        >
          <RotateCcw class="size-4" /> Refund
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="refundOpen" title="Refund order" size="sm">
      <div v-if="selected" class="space-y-4">
        <p class="text-sm">
          Refund <b>{{ settings.money(selected.total) }}</b> for order #{{ selected.number }}?
          <span v-if="selected.payments.some((p) => p.method === 'cash')" class="text-ink-muted">
            Cash refunds are deducted from the current shift's drawer.</span
          >
        </p>
        <div>
          <label class="label" for="reason">Reason</label>
          <input id="reason" v-model="refundReason" class="input" placeholder="e.g. Wrong order" />
        </div>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="restock" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
          Return items to stock
        </label>
      </div>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="refundOpen = false">Cancel</button>
        <button class="btn btn-danger flex-1" @click="doRefund">Confirm refund</button>
      </template>
    </BaseModal>
  </div>
</template>
