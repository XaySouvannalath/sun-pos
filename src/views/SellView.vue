<script setup lang="ts">
import { t } from '@/i18n'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRightLeft, Search, ScanBarcode, ShoppingCart, Tag, Wallet, X } from 'lucide-vue-next'
import { promotionRunning } from '@/utils/promotions'
import ProductCard from '@/components/sell/ProductCard.vue'
import TopSellers from '@/components/sell/TopSellers.vue'
import OptionPicker from '@/components/sell/OptionPicker.vue'
import CartPanel from '@/components/sell/CartPanel.vue'
import PaymentModal from '@/components/sell/PaymentModal.vue'
import ReceiptModal from '@/components/ReceiptModal.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useCartStore, type CheckoutOptions } from '@/stores/cart'
import { useAuthStore } from '@/stores/auth'
import { useRatesStore } from '@/stores/rates'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { tintClasses } from '@/utils/tints'
import { flyToCart } from '@/utils/motion'
import type { Order, Product, SelectedOption } from '@/types'

const catalog = useCatalogStore()
const cart = useCartStore()
const shift = useShiftStore()
const auth = useAuthStore()
const rates = useRatesStore()
const running = computed(() =>
  catalog.promotions.filter((p) =>
    promotionRunning(p, new Date(cart.now), auth.branchId || undefined),
  ),
)
const settings = useSettingsStore()
const toast = useToastStore()

const query = ref('')
const category = ref<string>('all')
const searchEl = ref<HTMLInputElement>()

const pickerOpen = ref(false)
const pickerProduct = ref<Product | null>(null)
const payOpen = ref(false)
const receiptOpen = ref(false)
const lastOrder = ref<Order | null>(null)
const cartDrawer = ref(false)
const shiftOpen = ref(false)
const openingFloat = ref(0)

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return catalog.activeProducts.filter(
    (p) =>
      (category.value === 'all' || p.categoryId === category.value) &&
      (!q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)),
  )
})

const inCart = computed(() => {
  const m = new Map<string, number>()
  for (const l of cart.state.lines) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty)
  return m
})

function stockAllows(p: Product, adding = 1) {
  if (p.stock === null) return true
  return (inCart.value.get(p.id) ?? 0) + adding <= p.stock
}

function quickAdd(p: Product, from?: HTMLElement) {
  if (!stockAllows(p))
    return toast.show(t('sell.onlyInStock', { n: p.stock ?? 0, name: p.name }), 'error')
  cart.add(p)
  flyToCart(from, p.emoji)
  toast.show(t('sell.added', { name: p.name }))
}

// Where the options dialog was opened from, so the item can fly from there to the cart.
let pickerFrom: HTMLElement | undefined

function customize(p: Product) {
  pickerFrom = (document.activeElement as HTMLElement | null) ?? undefined
  pickerProduct.value = p
  pickerOpen.value = true
}

function addWithOptions(options: SelectedOption[], qty: number) {
  const p = pickerProduct.value
  if (!p) return
  if (!stockAllows(p, qty))
    return toast.show(t('sell.onlyInStock', { n: p.stock ?? 0, name: p.name }), 'error')
  cart.add(p, options, qty)
  flyToCart(pickerFrom, p.emoji)
  toast.show(t('sell.addedQty', { qty, name: p.name }))
}

/** Barcode scanners type the code and press Enter. */
function onSearchEnter() {
  const p = catalog.findByCode(query.value)
  if (p) {
    quickAdd(p)
    query.value = ''
  } else if (visible.value.length === 1) {
    quickAdd(visible.value[0]!)
    query.value = ''
  }
}

// Split bill: what the next payment covers (nothing set = the whole order).
const payFor = ref<CheckoutOptions>({})

function startPayment(opts: CheckoutOptions = {}) {
  if (cart.isEmpty) return
  payFor.value = opts
  if (!shift.current) {
    shiftOpen.value = true
    return
  }
  cartDrawer.value = false
  payOpen.value = true
}

async function openShiftAndPay() {
  await shift.open(Math.max(0, Number(openingFloat.value) || 0))
  shiftOpen.value = false
  toast.show(t('shift.opened'), 'success')
  payOpen.value = true
}

function onPaid(order: Order) {
  lastOrder.value = order
  receiptOpen.value = true
}

function onKey(e: KeyboardEvent) {
  if (document.querySelector('[role="dialog"]')) return
  if (e.key === 'F9') {
    e.preventDefault()
    startPayment()
  } else if (e.key === 'F2' || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
    e.preventDefault()
    searchEl.value?.focus()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="flex h-full">
    <section class="flex min-w-0 flex-1 flex-col">
      <!-- Search -->
      <div class="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-3 md:px-6">
        <div class="relative flex-1">
          <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
          <input
            ref="searchEl"
            v-model="query"
            class="input pr-20 pl-10"
            :placeholder="t('sell.searchPlaceholder')"
            :aria-label="t('sell.searchLabel')"
            @keydown.enter="onSearchEnter"
          />
          <button
            v-if="query"
            class="absolute top-1.5 right-10 grid size-8 place-items-center text-ink-muted"
            :aria-label="t('common.clearSearch')"
            @click="query = ''"
          >
            <X class="size-4" />
          </button>
          <ScanBarcode class="absolute top-3 right-3 size-5 text-ink-muted" />
        </div>
        <RouterLink
          v-if="!shift.current"
          to="/shift"
          class="btn btn-sm hidden bg-accent-soft text-accent sm:inline-flex"
        >
          <Wallet class="size-4" /> {{ t('sell.noOpenShift') }}
        </RouterLink>
        <RouterLink
          v-if="auth.isAdmin && rates.missingToday"
          to="/rates"
          class="btn btn-sm hidden bg-accent-soft text-accent sm:inline-flex"
        >
          <ArrowRightLeft class="size-4" /> {{ t('rates.setToday') }}
        </RouterLink>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6">
        <!-- Promotions running now, so staff can tell customers -->
        <div v-if="running.length && !query" class="flex flex-wrap gap-2">
          <span
            v-for="p in running"
            :key="p.id"
            class="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success"
          >
            <Tag class="size-3.5" /> {{ p.name
            }}<template v-if="p.timeTo">
              · {{ t('promotions.until', { time: p.timeTo }) }}</template
            >
          </span>
        </div>
        <TopSellers v-if="!query" @add="(p, el) => quickAdd(p, el)" />

        <!-- Categories -->
        <div
          class="sticky -top-4 z-10 -mx-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2 md:-mx-6 md:px-6"
        >
          <button
            class="chip"
            :class="category === 'all' && 'chip-active'"
            :aria-pressed="category === 'all'"
            @click="category = 'all'"
          >
            {{ t('common.all') }}
          </button>
          <button
            v-for="c in catalog.categories"
            :key="c.id"
            class="chip"
            :class="category === c.id && 'chip-active'"
            :aria-pressed="category === c.id"
            @click="category = c.id"
          >
            <span class="size-2 rounded-full" :class="tintClasses[c.tint].dot" />
            {{ c.name }}
          </button>
        </div>

        <!-- Grid -->
        <!-- Keyed by category so the cards fade in again when the category changes -->
        <div
          v-if="visible.length"
          :key="category"
          class="grid grid-cols-2 gap-3 pb-20 sm:grid-cols-3 lg:pb-4 xl:grid-cols-4 2xl:grid-cols-5"
        >
          <ProductCard
            v-for="(p, i) in visible"
            :key="p.id"
            class="anim-fade-up"
            :style="{ '--i': Math.min(i, 12) }"
            :product="p"
            :in-cart="inCart.get(p.id)"
            @add="(el) => quickAdd(p, el)"
            @customize="customize(p)"
          />
        </div>
        <p v-else class="py-16 text-center text-ink-muted">{{ t('sell.noMatch', { q: query }) }}</p>
      </div>
    </section>

    <!-- Cart: side panel on large screens -->
    <div class="hidden w-[380px] shrink-0 border-l border-line lg:block xl:w-[420px]">
      <CartPanel @pay="startPayment" />
    </div>

    <!-- Cart: drawer on smaller screens -->
    <button
      class="btn btn-primary btn-lg fixed right-4 bottom-20 z-30 shadow-lg md:bottom-4 lg:hidden"
      data-cart-target
      @click="cartDrawer = true"
    >
      <ShoppingCart class="size-5" />
      {{ cart.totals.itemCount }} · {{ settings.money(cart.totals.total) }}
    </button>
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200"
        enter-from-class="translate-x-full"
        leave-active-class="transition duration-150"
        leave-to-class="translate-x-full"
      >
        <div
          v-if="cartDrawer"
          class="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-line shadow-2xl lg:hidden"
        >
          <CartPanel closable @close="cartDrawer = false" @pay="startPayment" />
        </div>
      </Transition>
    </Teleport>

    <OptionPicker v-model="pickerOpen" :product="pickerProduct" @add="addWithOptions" />
    <PaymentModal
      v-model="payOpen"
      :selection="payFor.selection"
      :split-ways="payFor.splitWays"
      @paid="onPaid"
    />
    <ReceiptModal v-model="receiptOpen" :order="lastOrder" just-paid />

    <BaseModal v-model="shiftOpen" :title="t('sell.openShiftFirst')" size="sm">
      <p class="mb-4 text-sm text-ink-muted">{{ t('sell.openShiftHelp') }}</p>
      <label class="label" for="float">{{ t('sell.openingCash') }}</label>
      <input
        id="float"
        v-model.number="openingFloat"
        type="number"
        min="0"
        class="input text-lg"
        @keydown.enter="openShiftAndPay"
      />
      <template #footer>
        <button class="btn btn-soft" @click="shiftOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary flex-1" @click="openShiftAndPay">
          {{ t('sell.openShiftAndCharge') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
