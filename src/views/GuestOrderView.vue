<script setup lang="ts">
// The page a guest opens by scanning the table's QR code: the menu, a basket and their orders.
// No sign-in; it talks only to the /public endpoints.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { embedded } from '@/utils/env'
import {
  Check,
  ChefHat,
  Clock,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from 'lucide-vue-next'
import { fmtTime, language, languages, t } from '@/i18n'
import { api } from '@/api'
import { ApiError } from '@/api/client'
import BaseModal from '@/components/ui/BaseModal.vue'
import { tintClasses } from '@/utils/tints'
import { lineKey, uid } from '@/utils/pos'
import { readStorage, writeStorage } from '@/composables/persisted'
import type { GuestOrder, PublicMenu, PublicProduct, SelectedOption } from '@/types'

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const menu = ref<PublicMenu | null>(null)
const error = ref('')
const loading = ref(true)

async function loadMenu() {
  loading.value = true
  error.value = ''
  try {
    menu.value = await api.guest.menu(token.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const money = computed(() => {
  const s = menu.value?.store
  const d = s?.decimals ?? 2
  try {
    const f = new Intl.NumberFormat(s?.locale, {
      style: 'currency',
      currency: s?.currency ?? 'USD',
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    })
    return (n: number) => f.format(n)
  } catch {
    return (n: number) => n.toFixed(d)
  }
})

// ----- Menu --------------------------------------------------------------

const category = ref('')
const shown = computed(() =>
  (menu.value?.products ?? []).filter((p) => !category.value || p.categoryId === category.value),
)
const tintOf = (p: PublicProduct) =>
  tintClasses[menu.value?.categories.find((c) => c.id === p.categoryId)?.tint ?? 'sand'].tile

// ----- Basket (kept on the phone for this table) -------------------------

interface BasketLine {
  key: string
  productId: string
  name: string
  emoji: string
  unitPrice: number
  qty: number
  options: SelectedOption[]
  note: string
}
const storeKey = (what: string) => `guest.${what}.${token.value}`
const basket = ref<BasketLine[]>(readStorage<BasketLine[]>(storeKey('basket')) ?? [])
watch(basket, (b) => writeStorage(storeKey('basket'), b), { deep: true })
const count = computed(() => basket.value.reduce((a, l) => a + l.qty, 0))
const subtotal = computed(() => basket.value.reduce((a, l) => a + l.unitPrice * l.qty, 0))

// Choosing options for an item.
const picking = ref<PublicProduct | null>(null)
const chosen = ref<Record<string, string[]>>({})
const pickQty = ref(1)
const pickNote = ref('')

function open(p: PublicProduct) {
  if (p.soldOut) return
  if (!p.options.length) return addLine(p, [], 1, '')
  picking.value = p
  // Required single choices start on their first option.
  chosen.value = Object.fromEntries(
    p.options.map((g) => [
      g.name,
      g.required && !g.multiple && g.choices[0] ? [g.choices[0].name] : [],
    ]),
  )
  pickQty.value = 1
  pickNote.value = ''
}

function toggle(group: string, name: string, multiple: boolean) {
  const cur = chosen.value[group] ?? []
  chosen.value[group] = multiple
    ? cur.includes(name)
      ? cur.filter((x) => x !== name)
      : [...cur, name]
    : [name]
}

const pickOptions = computed<SelectedOption[]>(() =>
  (picking.value?.options ?? []).flatMap((g) =>
    (chosen.value[g.name] ?? []).map((name) => ({
      group: g.name,
      name,
      price: g.choices.find((c) => c.name === name)?.price ?? 0,
    })),
  ),
)
const pickMissing = computed(() =>
  (picking.value?.options ?? []).some((g) => g.required && !(chosen.value[g.name] ?? []).length),
)
const pickPrice = computed(
  () => (picking.value?.price ?? 0) + pickOptions.value.reduce((a, o) => a + o.price, 0),
)

function addLine(p: PublicProduct, options: SelectedOption[], qty: number, note: string) {
  const key = lineKey(p.id, options)
  const same = !note && basket.value.find((l) => l.key === key && !l.note)
  if (same) same.qty += qty
  else
    basket.value.push({
      key,
      productId: p.id,
      name: p.name,
      emoji: p.emoji,
      unitPrice: p.price + options.reduce((a, o) => a + o.price, 0),
      qty,
      options,
      note,
    })
  flash.value = p.id
  setTimeout(() => flash.value === p.id && (flash.value = ''), 600)
}
const flash = ref('')

function confirmPick() {
  if (!picking.value || pickMissing.value) return
  addLine(picking.value, pickOptions.value, pickQty.value, pickNote.value.trim())
  picking.value = null
}

function step(l: BasketLine, by: number) {
  l.qty += by
  if (l.qty <= 0) basket.value = basket.value.filter((x) => x !== l)
}

// ----- Sending and following orders --------------------------------------

const basketOpen = ref(false)
const guestName = ref(readStorage<string>('guest.name') ?? '')
const note = ref('')
const sending = ref(false)
const sendError = ref('')
/** The order id for this basket, so a retried send is not ordered twice. */
let pendingId = ''

const myIds = ref<string[]>(readStorage<string[]>(storeKey('orders')) ?? [])
const orders = ref<GuestOrder[]>([])

async function send() {
  if (!basket.value.length || sending.value) return
  sending.value = true
  sendError.value = ''
  pendingId ||= uid()
  try {
    const o = await api.guest.order({
      table: token.value,
      id: pendingId,
      lines: basket.value.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        options: l.options.map(({ group, name }) => ({ group, name })),
        note: l.note,
      })),
      note: note.value.trim(),
      guestName: guestName.value.trim(),
      language: language.value,
    })
    writeStorage('guest.name', guestName.value.trim())
    myIds.value = [o.id, ...myIds.value.filter((x) => x !== o.id)].slice(0, 20)
    writeStorage(storeKey('orders'), myIds.value)
    orders.value = [o, ...orders.value.filter((x) => x.id !== o.id)]
    basket.value = []
    note.value = ''
    pendingId = ''
    basketOpen.value = false
    watchOrders()
  } catch (e) {
    // A changed basket gets a new id; the same basket keeps it for a retry.
    if (e instanceof ApiError && e.status < 500) pendingId = ''
    sendError.value = e instanceof Error ? e.message : String(e)
  } finally {
    sending.value = false
  }
}

async function loadOrders() {
  if (!myIds.value.length) return
  const list = await api.guest.orders(token.value, myIds.value)
  orders.value = list.sort((a, b) => b.createdAt - a.createdAt)
}

// While an order waits for the staff, check every 5 seconds.
let timer: ReturnType<typeof setInterval> | undefined
function watchOrders() {
  clearInterval(timer)
  timer = setInterval(() => {
    if (!orders.value.some((o) => o.status === 'pending')) return clearInterval(timer)
    void loadOrders().catch(() => null)
  }, 5000)
}

onMounted(async () => {
  await loadMenu()
  await loadOrders().catch(() => null)
  if (orders.value.some((o) => o.status === 'pending')) watchOrders()
})
onBeforeUnmount(() => clearInterval(timer))

const statusIcon = { pending: Clock, accepted: ChefHat, rejected: X }
const statusClass = {
  pending: 'bg-accent-soft text-accent',
  accepted: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
}
</script>

<template>
  <div class="min-h-full bg-bg pb-28">
    <!-- Header -->
    <header
      class="sticky top-0 z-30 border-b border-line bg-surface/95 px-4 pt-4 pb-3 backdrop-blur"
    >
      <div class="mx-auto flex max-w-2xl items-start gap-3">
        <div
          class="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-xl text-primary-ink"
        >
          ☀
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-lg font-bold">{{ menu?.store.storeName ?? 'Sun POS' }}</h1>
          <p v-if="menu" class="text-sm text-ink-muted">
            <UtensilsCrossed class="inline size-3.5" />
            {{ t('cart.tableN', { n: menu.table }) }} · {{ menu.branch }}
          </p>
        </div>
        <select
          v-model="language"
          class="input h-9 w-auto py-0 text-sm"
          :aria-label="t('settings.language')"
        >
          <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </div>
      <div
        v-if="menu"
        class="mx-auto mt-3 flex max-w-2xl gap-2 overflow-x-auto pb-1"
        role="group"
        :aria-label="t('guest.categories')"
      >
        <button class="chip shrink-0" :class="!category && 'chip-active'" @click="category = ''">
          {{ t('guest.all') }}
        </button>
        <button
          v-for="c in menu.categories"
          :key="c.id"
          class="chip shrink-0"
          :class="category === c.id && 'chip-active'"
          @click="category = c.id"
        >
          {{ c.name }}
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-2xl space-y-5 px-4 pt-4">
      <!-- The preview has no address bar: a way back to the staff screens. -->
      <RouterLink
        v-if="embedded"
        to="/tables"
        class="block rounded-xl bg-accent-soft px-3 py-2 text-center text-sm font-semibold"
      >
        {{ t('guest.backToTill') }}
      </RouterLink>
      <p v-if="loading" class="py-16 text-center text-ink-muted">{{ t('common.loading') }}</p>
      <div v-else-if="error" class="card p-8 text-center">
        <p class="font-semibold">{{ error }}</p>
        <p class="mt-1 text-sm text-ink-muted">{{ t('guest.askStaff') }}</p>
        <button class="btn btn-outline mt-4" @click="loadMenu">
          <RefreshCw class="size-4" /> {{ t('guest.retry') }}
        </button>
      </div>

      <!-- My orders -->
      <section v-if="orders.length" class="space-y-2">
        <h2 class="font-semibold">{{ t('guest.yourOrders') }}</h2>
        <article v-for="o in orders" :key="o.id" class="card p-3">
          <div class="flex items-center gap-2">
            <span class="badge py-1" :class="statusClass[o.status]">
              <component :is="statusIcon[o.status]" class="size-3.5" />
              {{ t(`guest.status.${o.status}`) }}
            </span>
            <span class="ml-auto text-xs text-ink-muted">{{ fmtTime(o.createdAt) }}</span>
          </div>
          <p class="mt-2 text-sm">
            {{ o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ') }}
          </p>
          <p v-if="o.status === 'rejected' && o.reason" class="mt-1 text-sm text-danger">
            {{ o.reason }}
          </p>
        </article>
      </section>

      <!-- Menu -->
      <ul v-if="menu" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <li v-for="p in shown" :key="p.id">
          <button
            class="card flex w-full items-center gap-3 p-3 text-left transition active:scale-[0.99]"
            :class="p.soldOut && 'opacity-50'"
            :disabled="p.soldOut"
            @click="open(p)"
          >
            <span
              class="grid size-14 shrink-0 place-items-center rounded-xl text-3xl"
              :class="tintOf(p)"
            >
              {{ p.emoji }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ p.name }}</span>
              <span class="text-sm text-ink-muted">
                {{ p.soldOut ? t('guest.soldOut') : money(p.price) }}
              </span>
            </span>
            <span
              v-if="!p.soldOut"
              class="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-ink transition"
              :class="flash === p.id && 'scale-125'"
            >
              <Check v-if="flash === p.id" class="size-5" />
              <Plus v-else class="size-5" />
            </span>
          </button>
        </li>
      </ul>
    </main>

    <!-- Basket bar -->
    <div
      v-if="count"
      class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <button
        class="btn btn-primary btn-lg mx-auto flex w-full max-w-2xl"
        @click="basketOpen = true"
      >
        <ShoppingBag class="size-5" />
        <span class="flex-1 text-left">{{ t('guest.viewBasket', { n: count }) }}</span>
        <span class="tabular-nums">{{ money(subtotal) }}</span>
      </button>
    </div>

    <!-- Options -->
    <BaseModal
      :model-value="!!picking"
      :title="picking ? `${picking.emoji} ${picking.name}` : ''"
      @update:model-value="picking = null"
    >
      <div v-if="picking" class="space-y-4">
        <fieldset v-for="g in picking.options" :key="g.id">
          <legend class="mb-2 text-sm font-semibold">
            {{ g.name }}
            <span class="font-normal text-ink-muted">
              · {{ g.required ? t('guest.required') : t('guest.optional') }}</span
            >
          </legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in g.choices"
              :key="c.name"
              class="chip"
              :class="(chosen[g.name] ?? []).includes(c.name) && 'chip-active'"
              :aria-pressed="(chosen[g.name] ?? []).includes(c.name)"
              @click="toggle(g.name, c.name, g.multiple)"
            >
              {{ c.name }}<template v-if="c.price"> +{{ money(c.price) }}</template>
            </button>
          </div>
        </fieldset>
        <div>
          <label class="label" for="g-note">{{ t('guest.itemNote') }}</label>
          <input
            id="g-note"
            v-model="pickNote"
            class="input"
            maxlength="200"
            :placeholder="t('guest.itemNotePlaceholder')"
          />
        </div>
      </div>
      <template #footer>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-outline btn-icon"
            :aria-label="t('guest.less')"
            :disabled="pickQty <= 1"
            @click="pickQty--"
          >
            <Minus class="size-4" />
          </button>
          <span class="w-6 text-center font-semibold tabular-nums">{{ pickQty }}</span>
          <button class="btn btn-outline btn-icon" :aria-label="t('guest.more')" @click="pickQty++">
            <Plus class="size-4" />
          </button>
        </div>
        <button class="btn btn-primary flex-1" :disabled="pickMissing" @click="confirmPick">
          {{ t('guest.add') }} · {{ money(pickPrice * pickQty) }}
        </button>
      </template>
    </BaseModal>

    <!-- Basket -->
    <BaseModal v-model="basketOpen" :title="t('guest.basket')">
      <ul class="divide-y divide-line/70">
        <li v-for="l in basket" :key="l.key + l.note" class="flex items-center gap-3 py-3">
          <span class="text-2xl">{{ l.emoji }}</span>
          <div class="min-w-0 flex-1">
            <p class="font-medium">{{ l.name }}</p>
            <p v-if="l.options.length || l.note" class="text-xs text-ink-muted">
              {{
                [...l.options.map((o) => o.name), l.note && `“${l.note}”`]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
            <p class="text-sm tabular-nums">{{ money(l.unitPrice * l.qty) }}</p>
          </div>
          <button
            class="btn btn-outline btn-icon btn-sm"
            :aria-label="t('guest.less')"
            @click="step(l, -1)"
          >
            <Minus class="size-4" />
          </button>
          <span class="w-5 text-center font-semibold tabular-nums">{{ l.qty }}</span>
          <button
            class="btn btn-outline btn-icon btn-sm"
            :aria-label="t('guest.more')"
            @click="step(l, 1)"
          >
            <Plus class="size-4" />
          </button>
        </li>
      </ul>
      <div class="mt-3 space-y-3">
        <div>
          <label class="label" for="g-name">{{ t('guest.name') }}</label>
          <input id="g-name" v-model="guestName" class="input" maxlength="40" />
        </div>
        <div>
          <label class="label" for="g-order-note">{{ t('guest.note') }}</label>
          <input
            id="g-order-note"
            v-model="note"
            class="input"
            maxlength="300"
            :placeholder="t('guest.notePlaceholder')"
          />
        </div>
        <p class="flex justify-between font-semibold">
          <span>{{ t('guest.subtotal') }}</span>
          <span class="tabular-nums">{{ money(subtotal) }}</span>
        </p>
        <p class="text-xs text-ink-muted">{{ t('guest.payHelp') }}</p>
        <p v-if="sendError" class="text-sm text-danger" role="alert">{{ sendError }}</p>
      </div>
      <template #footer>
        <button
          class="btn btn-primary btn-lg flex-1"
          :disabled="sending || !basket.length"
          @click="send"
        >
          {{ sending ? t('guest.sending') : t('guest.send') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
