<script setup lang="ts">
import { t } from '@/i18n'
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
  Split,
  ChefHat,
  LayoutGrid,
  CircleCheck,
} from 'lucide-vue-next'
import LineEditor from './LineEditor.vue'
import DiscountModal from './DiscountModal.vue'
import CustomerPicker from './CustomerPicker.vue'
import HeldOrders from './HeldOrders.vue'
import SplitBillModal from './SplitBillModal.vue'
import TablePicker from './TablePicker.vue'
import { useRouter } from 'vue-router'
import { useFloorStore } from '@/stores/floor'
import { useCatalogStore } from '@/stores/catalog'
import BaseModal from '@/components/ui/BaseModal.vue'
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue'
import { useCartStore } from '@/stores/cart'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { lineTotal } from '@/utils/pos'
import type { OrderType } from '@/types'
import type { CheckoutOptions } from '@/stores/cart'

defineProps<{ closable?: boolean }>()
const emit = defineEmits<{ pay: [opts?: CheckoutOptions]; close: [] }>()

const cart = useCartStore()
const customers = useCustomersStore()
const settings = useSettingsStore()
const toast = useToastStore()
const floor = useFloorStore()
const catalog = useCatalogStore()
const router = useRouter()
const tableOpen = ref(false)

const editIndex = ref(-1)
const editOpen = ref(false)
const discountOpen = ref(false)
const customerOpen = ref(false)
const heldOpen = ref(false)
const noteOpen = ref(false)
const splitOpen = ref(false)

// Small icon-over-label buttons, so four fit with longer translations.
const tool =
  'btn btn-soft h-14 flex-col gap-0.5 rounded-xl px-1 text-[11px] leading-tight whitespace-normal'
const confirmClear = ref(false)

const customer = computed(() =>
  cart.state.customerId ? customers.byId.get(cart.state.customerId) : undefined,
)

const types: { id: OrderType; icon: typeof Utensils }[] = [
  { id: 'dine-in', icon: Utensils },
  { id: 'takeaway', icon: ShoppingBag },
  { id: 'delivery', icon: Bike },
]

function edit(i: number) {
  editIndex.value = i
  editOpen.value = true
}

async function hold() {
  const label = cart.state.table
    ? t('cart.tableN', { n: cart.state.table })
    : customer.value?.name || t('cart.orderN', { n: cart.held.length + 1 })
  await cart.hold(label)
  toast.show(t('cart.held', { label }), 'success')
}

async function clear() {
  await cart.discard()
  confirmClear.value = false
}

const sending = ref(false)
/** Sends new items to the kitchen and bar. A table's order then goes back to the floor plan. */
async function send() {
  if (sending.value) return
  sending.value = true
  try {
    const table = cart.state.tableId
    const { tickets, parked } = await cart.send()
    const places = [
      ...new Set(tickets.map((tk) => catalog.stations.find((s) => s.id === tk.stationId)?.name)),
    ]
    toast.show(
      places.length ? t('kitchen.sent', { places: places.join(', ') }) : t('kitchen.nothingToSend'),
      'success',
    )
    if (parked && table) await router.push('/tables')
  } finally {
    sending.value = false
  }
}

/** "Sent" marks on lines that go to a station. */
function sentLabel(l: { qty: number; sentQty?: number; categoryId: string }) {
  if (!cart.hasStation(l.categoryId) || !l.sentQty) return ''
  return l.sentQty >= l.qty ? t('kitchen.sentAll') : t('kitchen.sentSome', { n: l.sentQty })
}
</script>

<template>
  <aside class="flex h-full flex-col bg-surface" data-cart-target>
    <!-- Header -->
    <div class="space-y-3 border-b border-line p-4">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 text-lg font-bold">{{ t('cart.title') }}</h2>
        <button class="btn btn-ghost btn-sm" @click="heldOpen = true">
          <History class="size-4" /> {{ t('cart.heldButton') }}
          <span v-if="cart.waiting.length" class="badge bg-accent text-primary-ink">{{
            cart.waiting.length
          }}</span>
        </button>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="t('cart.clearOrder')"
          :disabled="cart.isEmpty"
          @click="confirmClear = true"
        >
          <Trash2 class="size-4" />
        </button>
        <button
          v-if="closable"
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="t('common.close')"
          @click="emit('close')"
        >
          <X class="size-5" />
        </button>
      </div>

      <div class="segmented">
        <button
          v-for="ty in types"
          :key="ty.id"
          :aria-pressed="cart.state.orderType === ty.id"
          @click="cart.state.orderType = ty.id"
        >
          <component :is="ty.icon" class="size-4" /> {{ t(`orderType.${ty.id}`) }}
        </button>
      </div>

      <div class="flex gap-2">
        <button
          v-if="cart.state.orderType === 'dine-in' && floor.hasTables"
          class="flex h-10 w-28 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm"
          :class="
            cart.state.table
              ? 'border-primary/40 bg-primary-soft font-semibold'
              : 'border-dashed border-line text-ink-muted hover:border-primary hover:text-primary'
          "
          :aria-label="t('cart.tableLabel')"
          @click="tableOpen = true"
        >
          <LayoutGrid class="size-4 shrink-0" />
          <span class="truncate">{{ cart.state.table || t('cart.tablePlaceholder') }}</span>
        </button>
        <input
          v-else-if="cart.state.orderType === 'dine-in'"
          v-model="cart.state.table"
          class="input h-10 w-28"
          :placeholder="t('cart.tablePlaceholder')"
          :aria-label="t('cart.tableLabel')"
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
          <span class="truncate">{{ customer ? customer.name : t('cart.addCustomer') }}</span>
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
        <p class="font-medium">{{ t('cart.empty') }}</p>
        <p class="text-sm">{{ t('cart.emptyHint') }}</p>
      </div>
      <TransitionGroup v-else tag="ul" name="list" class="relative divide-y divide-line/70">
        <li
          v-for="(l, i) in cart.state.lines"
          :key="l.id ?? l.key + i"
          class="flex gap-3 bg-surface px-4 py-3"
        >
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
              <span
                v-if="sentLabel(l)"
                class="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-success"
                ><CircleCheck class="size-3" /> {{ sentLabel(l) }}</span
              >
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
                :aria-label="t('cart.removeOne', { name: l.name })"
                @click="cart.setQty(i, l.qty - 1)"
              >
                <Minus class="size-3.5" />
              </button>
              <!-- Keyed by quantity so the number pops each time it changes -->
              <span :key="l.qty" class="anim-pop w-6 text-center text-sm font-semibold">{{
                l.qty
              }}</span>
              <button
                class="grid size-8 place-items-center rounded-full hover:bg-surface"
                :aria-label="t('cart.addOne', { name: l.name })"
                @click="cart.setQty(i, l.qty + 1)"
              >
                <Plus class="size-3.5" />
              </button>
            </div>
          </div>
        </li>
      </TransitionGroup>
    </div>

    <!-- Totals -->
    <div class="space-y-3 border-t border-line p-4">
      <div class="grid grid-cols-4 gap-2">
        <button :class="tool" :disabled="cart.isEmpty" @click="discountOpen = true">
          <Percent class="size-4" /> {{ t('cart.discount') }}
        </button>
        <button :class="[tool, 'relative']" @click="noteOpen = true">
          <StickyNote class="size-4" /> {{ t('cart.note') }}
          <span
            v-if="cart.state.note"
            class="absolute top-1.5 right-2 size-1.5 rounded-full bg-accent"
          />
        </button>
        <button :class="tool" :disabled="cart.isEmpty" @click="splitOpen = true">
          <Split class="size-4" /> {{ t('cart.split') }}
        </button>
        <button :class="tool" :disabled="cart.isEmpty" @click="hold">
          <CirclePause class="size-4" /> {{ t('cart.hold') }}
        </button>
      </div>

      <dl class="space-y-1 text-sm">
        <div class="flex justify-between text-ink-muted">
          <dt>{{ t('cart.subtotalItems', { n: cart.totals.itemCount }) }}</dt>
          <dd>{{ settings.money(cart.totals.subtotal) }}</dd>
        </div>
        <div v-if="cart.totals.discount" class="flex justify-between text-success">
          <dt>
            {{ t('cart.discount') }}
            <template v-if="cart.state.discount.type === 'percent'"
              >({{ cart.state.discount.value }}%)</template
            >
          </dt>
          <dd>−{{ settings.money(cart.totals.discount) }}</dd>
        </div>
        <div v-if="settings.s.serviceRate" class="flex justify-between text-ink-muted">
          <dt>{{ t('cart.service', { rate: settings.s.serviceRate }) }}</dt>
          <dd>{{ settings.money(cart.totals.service) }}</dd>
        </div>
        <div v-if="settings.s.taxRate" class="flex justify-between text-ink-muted">
          <dt>{{ settings.s.taxLabel }} ({{ settings.s.taxRate }}%)</dt>
          <dd>{{ settings.money(cart.totals.tax) }}</dd>
        </div>
        <div class="flex items-baseline justify-between pt-1 text-xl font-bold">
          <dt>{{ t('common.total') }}</dt>
          <dd><AnimatedNumber :value="cart.totals.total" :format="settings.money" /></dd>
        </div>
      </dl>

      <div class="flex gap-2">
        <button
          v-if="cart.hasUnsent"
          class="btn btn-lg shrink-0 bg-accent-soft px-4 text-accent hover:brightness-95"
          :disabled="sending"
          @click="send"
        >
          <ChefHat class="size-5" /> {{ t('kitchen.send') }}
        </button>
        <button
          class="btn btn-primary btn-lg min-w-0 flex-1"
          :disabled="cart.isEmpty"
          @click="emit('pay')"
        >
          {{ t('cart.charge') }}
          <AnimatedNumber :value="cart.totals.total" :format="settings.money" />
          <kbd class="hidden rounded bg-black/10 px-1.5 text-xs font-medium xl:inline">F9</kbd>
        </button>
      </div>
    </div>

    <LineEditor v-model="editOpen" :index="editIndex" />
    <DiscountModal v-model="discountOpen" />
    <CustomerPicker v-model="customerOpen" />
    <HeldOrders v-model="heldOpen" />
    <TablePicker v-model="tableOpen" />
    <SplitBillModal
      v-model="splitOpen"
      @items="(selection) => emit('pay', { selection })"
      @equal="(splitWays) => emit('pay', { splitWays })"
    />

    <BaseModal v-model="noteOpen" :title="t('cart.orderNote')" size="sm">
      <textarea
        v-model="cart.state.note"
        rows="4"
        class="input"
        :placeholder="t('cart.orderNotePlaceholder')"
        :aria-label="t('cart.orderNote')"
      />
      <template #footer>
        <button class="btn btn-primary flex-1" @click="noteOpen = false">
          {{ t('common.done') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="confirmClear" :title="t('cart.clearTitle')" size="sm">
      <p class="text-sm text-ink-muted">{{ t('cart.clearBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmClear = false">
          {{ t('cart.keep') }}
        </button>
        <button class="btn btn-danger flex-1" @click="clear">{{ t('cart.clearOrder') }}</button>
      </template>
    </BaseModal>
  </aside>
</template>
