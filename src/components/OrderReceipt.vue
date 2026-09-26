<script setup lang="ts">
import { computed } from 'vue'
import { fmtDay, fmtFull, t } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import { useCustomersStore } from '@/stores/customers'
import { useAuthStore } from '@/stores/auth'
import { lineTotal } from '@/utils/pos'
import { convert, ratePair } from '@/utils/rates'
import type { Order } from '@/types'

const props = defineProps<{ order: Order }>()
const settings = useSettingsStore()
const customers = useCustomersStore()

/** Rates saved with the order, shown when the receipt setting is on. */
const rates = computed(() => {
  const snap = props.order.exchangeRates
  if (!snap?.rates.length || !settings.s.receiptShowRates) return null
  return {
    date: fmtDay(new Date(`${snap.date}T12:00:00`).getTime()),
    rows: snap.rates.map((r) => ({
      currency: r.currency,
      total: settings.moneyIn(convert(props.order.total, r), r.currency),
      pair: ratePair(snap.base, r),
    })),
  }
})

// With several branches, the receipt names the branch and uses its address and phone.
const auth = useAuthStore()
const branch = computed(() =>
  auth.multiBranch
    ? auth.branches.find((b) => b.id === (props.order.branchId ?? auth.branches[0]?.id))
    : undefined,
)
const address = computed(() => branch.value?.address || settings.s.address)
const phone = computed(() => branch.value?.phone || settings.s.phone)

const customer = computed(() =>
  props.order.customerId ? customers.byId.get(props.order.customerId) : undefined,
)
</script>

<template>
  <div
    class="print-area mx-auto w-full max-w-xs bg-white p-5 font-mono text-[12px] leading-relaxed text-neutral-800 shadow-sm"
  >
    <div class="text-center">
      <p class="text-base font-bold">{{ settings.s.storeName }}</p>
      <p v-if="branch" class="font-bold">{{ branch.name }}</p>
      <p v-if="address">{{ address }}</p>
      <p v-if="phone">{{ phone }}</p>
    </div>
    <div class="my-2 border-t border-dashed border-neutral-400" />
    <div class="flex justify-between">
      <span>{{ t('receipt.order', { n: order.number }) }}</span
      ><span
        >{{ t(`orderType.${order.orderType}`)
        }}{{ order.table ? ` · ${t('receipt.table', { n: order.table })}` : '' }}</span
      >
    </div>
    <p>{{ fmtFull(order.createdAt) }}</p>
    <p>{{ t('receipt.staff', { name: order.staffName }) }}</p>
    <p v-if="customer">{{ t('receipt.customer', { name: customer.name }) }}</p>
    <p v-if="order.status === 'refunded'" class="mt-1 text-center font-bold">
      *** {{ t('receipt.refunded') }} ***
    </p>
    <div class="my-2 border-t border-dashed border-neutral-400" />

    <div v-for="l in order.lines" :key="l.key" class="mb-1">
      <div class="flex justify-between gap-2">
        <span>{{ l.qty }} × {{ l.name }}</span>
        <span>{{ settings.money(lineTotal(l)) }}</span>
      </div>
      <p v-for="o in l.options" :key="o.name" class="pl-4 text-neutral-500">+ {{ o.name }}</p>
      <p v-if="l.discountPct" class="pl-4 text-neutral-500">
        {{ t('receipt.lineDiscount', { n: l.discountPct }) }}
      </p>
      <p v-if="l.note" class="pl-4 text-neutral-500">“{{ l.note }}”</p>
    </div>

    <div class="my-2 border-t border-dashed border-neutral-400" />
    <div class="flex justify-between">
      <span>{{ t('receipt.subtotal') }}</span
      ><span>{{ settings.money(order.subtotal) }}</span>
    </div>
    <div v-for="p in order.promotions ?? []" :key="p.id" class="flex justify-between gap-2">
      <span>{{ p.name }}</span
      ><span class="shrink-0">−{{ settings.money(p.amount) }}</span>
    </div>
    <div v-if="order.discount" class="flex justify-between">
      <span>{{ t('cart.discount') }}</span
      ><span>−{{ settings.money(order.discount) }}</span>
    </div>
    <div v-if="order.service" class="flex justify-between">
      <span>{{ t('receipt.service') }}</span
      ><span>{{ settings.money(order.service) }}</span>
    </div>
    <div v-if="order.tax" class="flex justify-between">
      <span>{{ settings.s.taxLabel }}</span
      ><span>{{ settings.money(order.tax) }}</span>
    </div>
    <div class="flex justify-between text-sm font-bold">
      <span>{{ t('receipt.total') }}</span
      ><span>{{ settings.money(order.total) }}</span>
    </div>
    <div class="my-2 border-t border-dashed border-neutral-400" />
    <p v-if="order.splitWays" class="mb-1">
      {{ t('receipt.splitWays', { n: order.splitWays }) }}
    </p>
    <div v-for="(p, i) in order.payments" :key="i" class="flex justify-between">
      <span
        >{{ p.guest ? `${t('split.guestN', { n: p.guest })} · ` : ''
        }}{{ t(`payMethod.${p.method}`) }}</span
      ><span>{{ settings.money(p.amount) }}</span>
    </div>
    <div v-if="order.change" class="flex justify-between">
      <span>{{ t('payment.change') }}</span
      ><span>{{ settings.money(order.change) }}</span>
    </div>
    <p v-if="order.pointsEarned" class="mt-1">
      {{ t('receipt.points', { n: order.pointsEarned }) }}
    </p>
    <p v-if="order.note" class="mt-1">{{ t('receipt.note', { note: order.note }) }}</p>

    <template v-if="rates">
      <div class="my-2 border-t border-dashed border-neutral-400" />
      <p>{{ t('receipt.rates', { date: rates.date }) }}</p>
      <div v-for="r in rates.rows" :key="r.currency">
        <div class="flex justify-between font-bold">
          <span>{{ t('receipt.totalIn', { currency: r.currency }) }}</span
          ><span>{{ r.total }}</span>
        </div>
        <p class="pl-4 text-neutral-500">
          1 {{ r.pair.one }} = {{ settings.rateNumber(r.pair.value) }} {{ r.pair.other }}
        </p>
      </div>
    </template>

    <p v-if="settings.s.receiptFooter" class="mt-3 text-center">{{ settings.s.receiptFooter }}</p>
  </div>
</template>
