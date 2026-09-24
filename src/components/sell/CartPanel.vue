<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Minus,
  Plus,
  Trash2,
  UserPlus,
  Percent,
  StickyNote,
  CirclePause,
  History,
  Utensils,
  ShoppingBag,
  Bike,
  ShoppingCart,
  X,
  Star,
} from 'lucide-vue-next'
import LineEditor from './LineEditor.vue'
import DiscountModal from './DiscountModal.vue'
import CustomerPicker from './CustomerPicker.vue'
import HeldOrders from './HeldOrders.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { lineTotal } from '@/utils/pos'
import type { OrderType } from '@/types'

defineProps<{ closable?: boolean }>()
const emit = defineEmits<{ pay: []; close: [] }>()

const cart = useCartStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const toast = useToastStore()

const editIndex = ref(-1)
const editOpen = ref(false)
const discountOpen = ref(false)
const customerOpen = ref(false)
const heldOpen = ref(false)
const noteOpen = ref(false)
const confirmClear = ref(false)

const customer = computed(() =>
  cart.state.customerId ? customers.byId.get(cart.state.customerId) : undefined,
)

const types: { id: OrderType; label: string; icon: typeof Utensils }[] = [
  { id: 'dine-in', label: 'Dine in', icon: Utensils },
  { id: 'takeaway', label: 'Takeaway', icon: ShoppingBag },
  { id: 'delivery', label: 'Delivery', icon: Bike },
]

function edit(i: number) {
  editIndex.value = i
  editOpen.value = true
}

function hold() {
  const label = cart.state.table
    ? `Table ${cart.state.table}`
    : customer.value?.name || `Order ${cart.held.length + 1}`
  cart.hold(label)
  toast.show(`Held: ${label}`, 'success')
}

function clear() {
  cart.clear()
  confirmClear.value = false
}
</script>

<template>
  <aside class="flex h-full flex-col bg-surface">
    <!-- Header -->
    <div class="space-y-3 border-b border-line p-4">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 text-lg font-bold">Current order</h2>
        <button class="btn btn-ghost btn-sm" @click="heldOpen = true">
          <History class="size-4" /> Held
          <span v-if="cart.held.length" class="badge bg-accent text-primary-ink">{{
            cart.held.length
          }}</span>
        </button>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          aria-label="Clear order"
          :disabled="cart.isEmpty"
          @click="confirmClear = true"
        >
          <Trash2 class="size-4" />
        </button>
        <button
          v-if="closable"
          class="btn btn-ghost btn-sm btn-icon"
          aria-label="Close"
          @click="emit('close')"
        >
          <X class="size-5" />
        </button>
      </div>

      <div class="segmented">
        <button
          v-for="t in types"
          :key="t.id"
          :aria-pressed="cart.state.orderType === t.id"
          @click="cart.state.orderType = t.id"
        >
          <component :is="t.icon" class="size-4" /> {{ t.label }}
        </button>
      </div>

      <div class="flex gap-2">
        <input
          v-if="cart.state.orderType === 'dine-in'"
          v-model="cart.state.table"
          class="input h-10 w-28"
          placeholder="Table #"
          aria-label="Table number"
        />
        <button
          class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed border-line px-3 text-sm text-ink-muted hover:border-primary hover:text-primary"
          :class="customer && 'border-solid border-primary/40 bg-primary-soft text-ink'"
          @click="customerOpen = true"
        >
          <UserPlus v-if="!customer" class="size-4" />
          <span
            v-else
            class="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent"
            >{{ customer.name.charAt(0) }}</span
          >
          <span class="truncate">{{ customer ? customer.name : 'Add customer' }}</span>
          <span v-if="customer" class="ml-auto flex items-center gap-0.5 text-xs text-accent">
            <Star class="size-3" /> {{ customer.points }}
          </span>
        </button>
      </div>
    </div>

    <!-- Lines -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div
        v-if="cart.isEmpty"
        class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-ink-muted"
      >
        <ShoppingCart class="size-12 opacity-40" />
        <p class="font-medium">No items yet</p>
        <p class="text-sm">Tap a product or a top seller to add it.</p>
      </div>
      <ul v-else class="divide-y divide-line/70">
        <li v-for="(l, i) in cart.state.lines" :key="l.key + i" class="flex gap-3 px-4 py-3">
          <button class="flex min-w-0 flex-1 gap-3 text-left" @click="edit(i)">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl"
              >{{ l.emoji }}</span
            >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">{{ l.name }}</span>
              <span v-if="l.options.length" class="block truncate text-xs text-ink-muted">
                {{ l.options.map((o) => o.name).join(' · ') }}
              </span>
              <span v-if="l.note" class="block truncate text-xs text-accent">“{{ l.note }}”</span>
              <span class="block text-xs text-ink-muted">
                {{ settings.money(l.unitPrice) }}
                <span v-if="l.discountPct" class="font-semibold text-success">
                  −{{ l.discountPct }}%</span
                >
              </span>
            </span>
          </button>
          <div class="flex flex-col items-end justify-between gap-1">
            <span class="text-sm font-bold">{{ settings.money(lineTotal(l)) }}</span>
            <div class="flex items-center gap-1 rounded-full bg-surface-2 p-0.5">
              <button
                class="grid size-8 place-items-center rounded-full hover:bg-surface"
                :aria-label="`Remove one ${l.name}`"
                @click="cart.setQty(i, l.qty - 1)"
              >
                <Minus class="size-3.5" />
              </button>
              <span class="w-6 text-center text-sm font-semibold">{{ l.qty }}</span>
              <button
                class="grid size-8 place-items-center rounded-full hover:bg-surface"
                :aria-label="`Add one ${l.name}`"
                @click="cart.setQty(i, l.qty + 1)"
              >
                <Plus class="size-3.5" />
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Totals -->
    <div class="space-y-3 border-t border-line p-4">
      <div class="flex gap-2">
        <button
          class="btn btn-soft btn-sm flex-1"
          :disabled="cart.isEmpty"
          @click="discountOpen = true"
        >
          <Percent class="size-4" /> Discount
        </button>
        <button class="btn btn-soft btn-sm flex-1" @click="noteOpen = true">
          <StickyNote class="size-4" /> Note
          <span v-if="cart.state.note" class="size-1.5 rounded-full bg-accent" />
        </button>
        <button class="btn btn-soft btn-sm flex-1" :disabled="cart.isEmpty" @click="hold">
          <CirclePause class="size-4" /> Hold
        </button>
      </div>

      <dl class="space-y-1 text-sm">
        <div class="flex justify-between text-ink-muted">
          <dt>Subtotal · {{ cart.totals.itemCount }} items</dt>
          <dd>{{ settings.money(cart.totals.subtotal) }}</dd>
        </div>
        <div v-if="cart.totals.discount" class="flex justify-between text-success">
          <dt>
            Discount
            <template v-if="cart.state.discount.type === 'percent'"
              >({{ cart.state.discount.value }}%)</template
            >
          </dt>
          <dd>−{{ settings.money(cart.totals.discount) }}</dd>
        </div>
        <div v-if="settings.s.serviceRate" class="flex justify-between text-ink-muted">
          <dt>Service ({{ settings.s.serviceRate }}%)</dt>
          <dd>{{ settings.money(cart.totals.service) }}</dd>
        </div>
        <div v-if="settings.s.taxRate" class="flex justify-between text-ink-muted">
          <dt>{{ settings.s.taxLabel }} ({{ settings.s.taxRate }}%)</dt>
          <dd>{{ settings.money(cart.totals.tax) }}</dd>
        </div>
        <div class="flex items-baseline justify-between pt-1 text-xl font-bold">
          <dt>Total</dt>
          <dd>{{ settings.money(cart.totals.total) }}</dd>
        </div>
      </dl>

      <button class="btn btn-primary btn-lg w-full" :disabled="cart.isEmpty" @click="emit('pay')">
        Charge {{ settings.money(cart.totals.total) }}
        <kbd class="hidden rounded bg-black/10 px-1.5 text-xs font-medium lg:inline">F9</kbd>
      </button>
    </div>

    <LineEditor v-model="editOpen" :index="editIndex" />
    <DiscountModal v-model="discountOpen" />
    <CustomerPicker v-model="customerOpen" />
    <HeldOrders v-model="heldOpen" />

    <BaseModal v-model="noteOpen" title="Order note" size="sm">
      <textarea
        v-model="cart.state.note"
        rows="4"
        class="input"
        placeholder="e.g. Deliver to 2nd floor, call on arrival"
        aria-label="Order note"
      />
      <template #footer>
        <button class="btn btn-primary flex-1" @click="noteOpen = false">Done</button>
      </template>
    </BaseModal>

    <BaseModal v-model="confirmClear" title="Clear this order?" size="sm">
      <p class="text-sm text-ink-muted">All items on the current order will be removed.</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmClear = false">Keep</button>
        <button class="btn btn-danger flex-1" @click="clear">Clear order</button>
      </template>
    </BaseModal>
  </aside>
</template>
