<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search, TriangleAlert, PackagePlus } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import type { Product } from '@/types'

const catalog = useCatalogStore()
const settings = useSettingsStore()
const toast = useToastStore()

const q = ref('')
const onlyLow = ref(false)
const adjusting = ref<Product | null>(null)
const mode = ref<'add' | 'remove' | 'set'>('add')
const amount = ref(0)
const reason = ref('')

const tracked = computed(() => {
  const s = q.value.trim().toLowerCase()
  return catalog.products
    .filter((p) => p.stock !== null)
    .filter((p) => !onlyLow.value || p.stock! <= p.lowStockAt)
    .filter((p) => !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
    .sort((a, b) => a.stock! - a.lowStockAt - (b.stock! - b.lowStockAt))
})

const stockValue = computed(() =>
  catalog.products.reduce((s, p) => s + (p.stock && p.stock > 0 ? p.stock * p.cost : 0), 0),
)

const adjustOpen = computed({
  get: () => !!adjusting.value,
  set: (v) => {
    if (!v) adjusting.value = null
  },
})

const reasons = {
  add: ['Delivery received', 'Returned', 'Correction'],
  remove: ['Wastage', 'Damaged', 'Staff meal', 'Correction'],
  set: ['Stock count'],
}

function start(p: Product, m: 'add' | 'remove' | 'set' = 'add') {
  adjusting.value = p
  mode.value = m
  amount.value = m === 'set' ? (p.stock ?? 0) : 0
  reason.value = reasons[m][0]!
}

const delta = computed(() => {
  const p = adjusting.value
  const n = Math.floor(Number(amount.value) || 0)
  if (!p || p.stock === null) return 0
  return mode.value === 'add' ? n : mode.value === 'remove' ? -n : n - p.stock
})

// Stock changes with every sale, so refresh when the page opens.
onMounted(() => Promise.all([catalog.refreshProducts(), catalog.loadMoves(40)]))

async function save() {
  const p = adjusting.value
  const d = delta.value
  if (!p || d === 0) return
  await catalog.adjustStock(p.id, d, reason.value)
  toast.show(`${p.name}: ${d > 0 ? '+' : ''}${d}`, 'success')
  adjusting.value = null
}

const fmt = (t: number) =>
  new Date(t).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
</script>

<template>
  <div class="page space-y-4">
    <h1 class="page-title">Stock</h1>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <div class="card p-4">
        <p class="text-xs text-ink-muted">Tracked items</p>
        <p class="text-2xl font-bold">
          {{ catalog.products.filter((p) => p.stock !== null).length }}
        </p>
      </div>
      <button
        class="card p-4 text-left"
        :class="catalog.lowStock.length > 0 && 'border-accent/50 bg-accent-soft'"
        @click="onlyLow = !onlyLow"
      >
        <p class="flex items-center gap-1 text-xs text-ink-muted">
          <TriangleAlert class="size-3.5" /> Low or out of stock
        </p>
        <p class="text-2xl font-bold" :class="catalog.lowStock.length > 0 && 'text-accent'">
          {{ catalog.lowStock.length }}
        </p>
      </button>
      <div class="card col-span-2 p-4 lg:col-span-1">
        <p class="text-xs text-ink-muted">Stock value (at cost)</p>
        <p class="text-2xl font-bold">{{ settings.money(stockValue) }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div class="relative min-w-60 flex-1">
        <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
        <input
          v-model="q"
          class="input pl-10"
          placeholder="Search stock"
          aria-label="Search stock"
        />
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="onlyLow" type="checkbox" class="size-4 accent-[var(--c-primary)]" /> Low
        stock only
      </label>
    </div>

    <div class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>Product</th>
            <th class="text-right">In stock</th>
            <th class="hidden text-right sm:table-cell">Alert at</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in tracked" :key="p.id">
            <td>
              <div class="flex items-center gap-3">
                <span class="text-xl">{{ p.emoji }}</span>
                <div>
                  <p class="font-medium">{{ p.name }}</p>
                  <p class="font-mono text-xs text-ink-muted">{{ p.sku }}</p>
                </div>
              </div>
            </td>
            <td class="text-right">
              <span v-if="p.stock! <= 0" class="badge bg-danger-soft text-danger"
                >Out · {{ p.stock }}</span
              >
              <span v-else-if="p.stock! <= p.lowStockAt" class="badge bg-accent-soft text-accent"
                >Low · {{ p.stock }}</span
              >
              <span v-else class="font-semibold">{{ p.stock }}</span>
            </td>
            <td class="hidden text-right text-ink-muted sm:table-cell">{{ p.lowStockAt }}</td>
            <td class="text-right whitespace-nowrap">
              <button class="btn btn-soft btn-sm" @click="start(p, 'add')">
                <PackagePlus class="size-4" /> Receive
              </button>
              <button class="btn btn-ghost btn-sm" @click="start(p, 'remove')">Remove</button>
              <button class="btn btn-ghost btn-sm" @click="start(p, 'set')">Count</button>
            </td>
          </tr>
          <tr v-if="!tracked.length">
            <td colspan="4" class="py-12 text-center text-ink-muted">
              Nothing to show. Turn on stock tracking in a product to manage it here.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <section>
      <h2 class="mb-3 text-lg font-semibold">Recent stock movements</h2>
      <div class="card overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Product</th>
              <th>Reason</th>
              <th class="hidden sm:table-cell">By</th>
              <th class="text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in catalog.stockMoves.slice(0, 40)" :key="m.id">
              <td class="whitespace-nowrap text-ink-muted">{{ fmt(m.at) }}</td>
              <td>{{ catalog.byId.get(m.productId)?.name ?? 'Deleted product' }}</td>
              <td class="text-ink-muted">{{ m.reason }}</td>
              <td class="hidden text-ink-muted sm:table-cell">{{ m.by }}</td>
              <td
                class="text-right font-semibold"
                :class="m.delta > 0 ? 'text-success' : 'text-danger'"
              >
                {{ m.delta > 0 ? '+' : '' }}{{ m.delta }}
              </td>
            </tr>
            <tr v-if="!catalog.stockMoves.length">
              <td colspan="5" class="py-8 text-center text-ink-muted">
                No movements yet. Sales, refunds and adjustments appear here.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal
      v-model="adjustOpen"
      :title="adjusting ? `${adjusting.emoji} ${adjusting.name}` : ''"
      size="sm"
    >
      <div v-if="adjusting" class="space-y-4">
        <div class="segmented">
          <button :aria-pressed="mode === 'add'" @click="start(adjusting, 'add')">Receive</button>
          <button :aria-pressed="mode === 'remove'" @click="start(adjusting, 'remove')">
            Remove
          </button>
          <button :aria-pressed="mode === 'set'" @click="start(adjusting, 'set')">Count</button>
        </div>
        <div>
          <label class="label" for="amt">{{
            mode === 'set' ? 'Counted quantity' : 'Quantity'
          }}</label>
          <input
            id="amt"
            v-model.number="amount"
            type="number"
            min="0"
            class="input text-lg"
            @keydown.enter="save"
          />
        </div>
        <div>
          <span class="label">Reason</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="r in reasons[mode]"
              :key="r"
              class="chip h-9"
              :class="reason === r && 'chip-active'"
              @click="reason = r"
            >
              {{ r }}
            </button>
          </div>
        </div>
        <p class="text-sm text-ink-muted">
          {{ adjusting.stock }} → <b class="text-ink">{{ (adjusting.stock ?? 0) + delta }}</b>
        </p>
      </div>
      <template #footer>
        <button class="btn btn-soft" @click="adjusting = null">Cancel</button>
        <button class="btn btn-primary flex-1" :disabled="delta === 0" @click="save">Save</button>
      </template>
    </BaseModal>
  </div>
</template>
