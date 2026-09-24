<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { Banknote, CreditCard, QrCode, X, Delete } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { quickCashAmounts } from '@/utils/pos'
import type { Order, Payment, PaymentMethod } from '@/types'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ paid: [order: Order] }>()

const cart = useCartStore()
const settings = useSettingsStore()

const methods: { id: PaymentMethod; icon: typeof Banknote }[] = [
  { id: 'cash', icon: Banknote },
  { id: 'card', icon: CreditCard },
  { id: 'qr', icon: QrCode },
]
const methodLabel = (m: PaymentMethod) => t(`payMethod.${m}`)

const payments = ref<Payment[]>([])
const method = ref<PaymentMethod>('cash')
const entry = ref('')

const total = computed(() => cart.totals.total)
const paid = computed(() => settings.round(payments.value.reduce((s, p) => s + p.amount, 0)))
const remaining = computed(() => settings.round(Math.max(total.value - paid.value, 0)))
const change = computed(() => settings.round(Math.max(paid.value - total.value, 0)))
const entryAmount = computed(() => Number(entry.value) || 0)
const quick = computed(() => quickCashAmounts(remaining.value, settings.s.decimals))

watch(open, (o) => {
  if (!o) return
  payments.value = []
  method.value = 'cash'
  entry.value = ''
})

function selectMethod(m: PaymentMethod) {
  method.value = m
  // Card and QR are charged the exact remaining amount by default.
  entry.value = m === 'cash' ? '' : String(remaining.value)
}

function addPayment(amount = entryAmount.value) {
  if (amount <= 0 || remaining.value <= 0) return
  // Only cash may exceed the amount due (the difference is change).
  const value = method.value === 'cash' ? amount : Math.min(amount, remaining.value)
  payments.value.push({ method: method.value, amount: settings.round(value) })
  entry.value = ''
}

function press(k: string) {
  if (k === 'back') entry.value = entry.value.slice(0, -1)
  else if (k === '.') {
    if (settings.s.decimals > 0 && !entry.value.includes('.'))
      entry.value = (entry.value || '0') + '.'
  } else if (k === '00') entry.value = entry.value ? entry.value + '00' : ''
  else entry.value += k
}

const busy = ref(false)

async function complete() {
  if (remaining.value > 0 || busy.value) return
  busy.value = true
  try {
    const order = await cart.checkout(payments.value)
    open.value = false
    emit('paid', order)
  } finally {
    busy.value = false
  }
}

const keys = computed(() => [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  settings.s.decimals ? '.' : '00',
  '0',
  'back',
])
</script>

<template>
  <BaseModal v-model="open" :title="t('payment.title')" size="xl">
    <div class="grid gap-6 md:grid-cols-2">
      <!-- Left: summary -->
      <div class="space-y-4">
        <div class="rounded-2xl bg-primary-soft p-5 text-center">
          <p class="text-sm text-ink-muted">{{ t('payment.totalDue') }}</p>
          <p class="text-4xl font-bold tracking-tight">{{ settings.money(total) }}</p>
          <p class="mt-1 text-xs text-ink-muted">
            {{ t('common.items', { n: cart.totals.itemCount }) }}
          </p>
        </div>

        <div class="space-y-2">
          <div
            v-for="(p, i) in payments"
            :key="i"
            class="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
          >
            <component
              :is="methods.find((m) => m.id === p.method)!.icon"
              class="size-5 text-ink-muted"
            />
            <span class="flex-1 text-sm font-medium">{{ methodLabel(p.method) }}</span>
            <span class="font-semibold">{{ settings.money(p.amount) }}</span>
            <button
              class="btn btn-ghost btn-sm btn-icon"
              :aria-label="t('payment.removePayment')"
              @click="payments.splice(i, 1)"
            >
              <X class="size-4" />
            </button>
          </div>
        </div>

        <dl class="space-y-1.5 rounded-2xl bg-surface-2 p-4">
          <div class="flex justify-between text-sm">
            <dt class="text-ink-muted">{{ t('payment.paid') }}</dt>
            <dd class="font-semibold">{{ settings.money(paid) }}</dd>
          </div>
          <div class="flex justify-between text-lg font-bold">
            <dt>{{ remaining > 0 ? t('payment.remaining') : t('payment.change') }}</dt>
            <dd :class="remaining > 0 ? 'text-danger' : 'text-success'">
              {{ settings.money(remaining > 0 ? remaining : change) }}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Right: input -->
      <div class="space-y-3">
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="m in methods"
            :key="m.id"
            class="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-semibold transition"
            :class="
              method === m.id
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-line hover:bg-surface-2'
            "
            :aria-pressed="method === m.id"
            @click="selectMethod(m.id)"
          >
            <component :is="m.icon" class="size-5" /> {{ methodLabel(m.id) }}
          </button>
        </div>

        <template v-if="remaining > 0">
          <div v-if="method === 'cash'" class="flex flex-wrap gap-2">
            <button
              v-for="a in quick"
              :key="a"
              class="btn btn-outline btn-sm flex-1"
              @click="addPayment(a)"
            >
              {{ a === remaining ? t('payment.exact') : settings.money(a) }}
            </button>
          </div>

          <div class="flex gap-2">
            <input
              v-model="entry"
              inputmode="decimal"
              class="input h-12 text-right text-xl font-bold"
              :placeholder="settings.money(remaining)"
              :aria-label="t('payment.amount')"
              @keydown.enter="addPayment()"
            />
            <button class="btn btn-primary h-12" :disabled="entryAmount <= 0" @click="addPayment()">
              {{ t('common.add') }}
            </button>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="k in keys"
              :key="k"
              class="btn btn-soft h-12 text-lg"
              :aria-label="k === 'back' ? t('common.backspace') : k"
              @click="press(k)"
            >
              <Delete v-if="k === 'back'" class="size-5" />
              <template v-else>{{ k }}</template>
            </button>
          </div>
        </template>
        <p
          v-else
          class="rounded-2xl bg-success-soft p-4 text-center text-sm font-medium text-success"
        >
          {{
            change
              ? t('payment.fullyPaidChange', { amount: settings.money(change) })
              : t('payment.fullyPaid')
          }}
        </p>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-soft" @click="open = false">{{ t('common.cancel') }}</button>
      <button
        class="btn btn-primary btn-lg flex-1"
        :disabled="remaining > 0 || busy"
        @click="complete"
      >
        {{ busy ? t('common.saving') : t('payment.complete') }}
      </button>
    </template>
  </BaseModal>
</template>
