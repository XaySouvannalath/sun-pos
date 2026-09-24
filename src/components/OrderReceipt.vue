<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useCustomersStore } from '@/stores/customers'
import { lineTotal } from '@/utils/pos'
import type { Order } from '@/types'

const props = defineProps<{ order: Order }>()
const settings = useSettingsStore()
const customers = useCustomersStore()

const customer = computed(() =>
  props.order.customerId ? customers.byId.get(props.order.customerId) : undefined,
)
const methodLabel = { cash: 'Cash', card: 'Card', qr: 'QR / Transfer' }
const typeLabel = { 'dine-in': 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery' }
</script>

<template>
  <div
    class="print-area mx-auto w-full max-w-xs bg-white p-5 font-mono text-[12px] leading-relaxed text-neutral-800 shadow-sm"
  >
    <div class="text-center">
      <p class="text-base font-bold">{{ settings.s.storeName }}</p>
      <p v-if="settings.s.address">{{ settings.s.address }}</p>
      <p v-if="settings.s.phone">{{ settings.s.phone }}</p>
    </div>
    <div class="my-2 border-t border-dashed border-neutral-400" />
    <div class="flex justify-between">
      <span>Order #{{ order.number }}</span
      ><span>{{ typeLabel[order.orderType] }}{{ order.table ? ` · T${order.table}` : '' }}</span>
    </div>
    <p>{{ new Date(order.createdAt).toLocaleString() }}</p>
    <p>Staff: {{ order.staffName }}</p>
    <p v-if="customer">Customer: {{ customer.name }}</p>
    <p v-if="order.status === 'refunded'" class="mt-1 text-center font-bold">*** REFUNDED ***</p>
    <div class="my-2 border-t border-dashed border-neutral-400" />

    <div v-for="l in order.lines" :key="l.key" class="mb-1">
      <div class="flex justify-between gap-2">
        <span>{{ l.qty }} × {{ l.name }}</span>
        <span>{{ settings.money(lineTotal(l)) }}</span>
      </div>
      <p v-for="o in l.options" :key="o.name" class="pl-4 text-neutral-500">+ {{ o.name }}</p>
      <p v-if="l.discountPct" class="pl-4 text-neutral-500">discount {{ l.discountPct }}%</p>
      <p v-if="l.note" class="pl-4 text-neutral-500">“{{ l.note }}”</p>
    </div>

    <div class="my-2 border-t border-dashed border-neutral-400" />
    <div class="flex justify-between">
      <span>Subtotal</span><span>{{ settings.money(order.subtotal) }}</span>
    </div>
    <div v-if="order.discount" class="flex justify-between">
      <span>Discount</span><span>−{{ settings.money(order.discount) }}</span>
    </div>
    <div v-if="order.service" class="flex justify-between">
      <span>Service</span><span>{{ settings.money(order.service) }}</span>
    </div>
    <div v-if="order.tax" class="flex justify-between">
      <span>{{ settings.s.taxLabel }}</span
      ><span>{{ settings.money(order.tax) }}</span>
    </div>
    <div class="flex justify-between text-sm font-bold">
      <span>TOTAL</span><span>{{ settings.money(order.total) }}</span>
    </div>
    <div class="my-2 border-t border-dashed border-neutral-400" />
    <div v-for="(p, i) in order.payments" :key="i" class="flex justify-between">
      <span>{{ methodLabel[p.method] }}</span
      ><span>{{ settings.money(p.amount) }}</span>
    </div>
    <div v-if="order.change" class="flex justify-between">
      <span>Change</span><span>{{ settings.money(order.change) }}</span>
    </div>
    <p v-if="order.pointsEarned" class="mt-1">Points earned: {{ order.pointsEarned }}</p>
    <p v-if="order.note" class="mt-1">Note: {{ order.note }}</p>

    <p v-if="settings.s.receiptFooter" class="mt-3 text-center">{{ settings.s.receiptFooter }}</p>
  </div>
</template>
