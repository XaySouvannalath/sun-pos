<script setup lang="ts">
import { computed, ref } from 'vue'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-vue-next'
import { formatDate, t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { promotionRunning } from '@/utils/promotions'
import { clone } from '@/utils/pos'
import type { PromoKind, Promotion } from '@/types'

const auth = useAuthStore()
const cart = useCartStore()
const catalog = useCatalogStore()
const settings = useSettingsStore()
const toast = useToastStore()

const running = (p: Promotion) =>
  promotionRunning(p, new Date(cart.now), auth.branchId || undefined)

// Day names in the current language, Monday first (0 = Sunday, as JavaScript counts).
const dayOrder = [1, 2, 3, 4, 5, 6, 0]
const dayName = (d: number) => formatDate(new Date(2024, 0, 7 + d).getTime(), { weekday: 'short' }) // 7 Jan 2024 was a Sunday

/** One line describing what a promotion does and when. */
function describe(p: Promotion) {
  const what =
    p.kind === 'percentOff'
      ? t('promotions.describe.percentOff', { n: p.percent, items: itemsText(p) })
      : p.kind === 'buyXGetY'
        ? t('promotions.describe.buyXGetY', { buy: p.buyQty, get: p.getQty, items: itemsText(p) })
        : t('promotions.describe.spendOver', { n: p.percent, amount: settings.money(p.minSpend) })
  const when = [
    p.days.length && p.days.length < 7
      ? dayOrder
          .filter((d) => p.days.includes(d))
          .map(dayName)
          .join(', ')
      : t('promotions.everyDay'),
    p.timeFrom && p.timeTo ? `${p.timeFrom}–${p.timeTo}` : '',
    p.dateFrom || p.dateTo ? `${p.dateFrom || '…'} → ${p.dateTo || '…'}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return `${what} · ${when}`
}

function itemsText(p: Promotion) {
  const names = [
    ...p.categoryIds.map((id) => catalog.categoryById.get(id)?.name),
    ...p.productIds.map((id) => catalog.byId.get(id)?.name),
  ].filter(Boolean)
  return names.length ? names.join(', ') : t('promotions.allItems')
}

async function toggle(p: Promotion) {
  await catalog.savePromotion({ ...p, active: !p.active })
}

// Editor
const blank = (): Promotion => ({
  id: '',
  name: '',
  active: true,
  kind: 'percentOff',
  percent: 10,
  buyQty: 2,
  getQty: 1,
  minSpend: 0,
  productIds: [],
  categoryIds: [],
  days: [],
  timeFrom: '',
  timeTo: '',
  dateFrom: '',
  dateTo: '',
  branchIds: [],
})
const form = ref<Promotion | null>(null)
const error = ref('')
const productQuery = ref('')

function edit(p: Promotion | null) {
  form.value = p ? clone(p) : blank()
  error.value = ''
  productQuery.value = ''
}

const kinds: PromoKind[] = ['percentOff', 'buyXGetY', 'spendOver']

function toggleIn(list: (string | number)[], v: string | number) {
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}

const productMatches = computed(() => {
  const q = productQuery.value.trim().toLowerCase()
  return catalog.products
    .filter((p) => p.active && (!q || p.name.toLowerCase().includes(q)))
    .slice(0, 12)
})

async function save() {
  const f = form.value
  if (!f) return
  if (!f.name.trim()) return (error.value = t('promotions.errors.name'))
  if (!!f.timeFrom !== !!f.timeTo) return (error.value = t('promotions.errors.time'))
  try {
    await catalog.savePromotion({ ...f, name: f.name.trim() })
    form.value = null
    toast.show(t('promotions.saved'), 'success')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

const confirmDelete = ref(false)
async function remove() {
  if (!form.value?.id) return
  await catalog.removePromotion(form.value.id)
  confirmDelete.value = false
  form.value = null
  toast.show(t('promotions.deleted'))
}
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex flex-1 items-center gap-2">
        <Tag class="size-7 text-primary" /> {{ t('promotions.title') }}
      </h1>
      <button class="btn btn-primary" @click="edit(null)">
        <Plus class="size-4" /> {{ t('promotions.add') }}
      </button>
    </div>
    <p class="max-w-3xl text-sm text-ink-muted">{{ t('promotions.subtitle') }}</p>

    <ul v-if="catalog.promotions.length" class="card divide-y divide-line/70">
      <li v-for="p in catalog.promotions" :key="p.id" class="flex items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 font-semibold">
            {{ p.name }}
            <span v-if="running(p)" class="badge bg-success-soft text-success">{{
              t('promotions.runningNow')
            }}</span>
            <span v-else-if="!p.active" class="badge bg-surface-2 text-ink-muted">{{
              t('promotions.off')
            }}</span>
          </p>
          <p class="text-sm text-ink-muted">{{ describe(p) }}</p>
        </div>
        <button
          role="switch"
          :aria-checked="p.active"
          :aria-label="p.name"
          class="relative h-7 w-12 shrink-0 rounded-full transition"
          :class="p.active ? 'bg-primary' : 'bg-line'"
          @click="toggle(p)"
        >
          <span
            class="absolute top-1 left-1 size-5 rounded-full bg-surface shadow transition"
            :class="p.active && 'translate-x-5'"
          />
        </button>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="t('products.editItem', { name: p.name })"
          @click="edit(p)"
        >
          <Pencil class="size-4" />
        </button>
      </li>
    </ul>
    <p v-else class="card p-10 text-center text-sm text-ink-muted">{{ t('promotions.empty') }}</p>

    <BaseModal
      :model-value="!!form"
      :title="form?.id ? t('promotions.edit') : t('promotions.add')"
      size="lg"
      @update:model-value="form = null"
    >
      <div v-if="form" class="space-y-4">
        <label class="block">
          <span class="label">{{ t('fields.name') }}</span>
          <input
            v-model="form.name"
            class="input"
            maxlength="80"
            :placeholder="t('promotions.namePlaceholder')"
          />
        </label>

        <div>
          <span class="label">{{ t('promotions.type') }}</span>
          <div class="segmented">
            <button
              v-for="k in kinds"
              :key="k"
              :aria-pressed="form.kind === k"
              @click="form.kind = k"
            >
              {{ t(`promotions.kinds.${k}`) }}
            </button>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <label v-if="form.kind !== 'buyXGetY'">
            <span class="label">{{ t('promotions.percent') }}</span>
            <input v-model.number="form.percent" type="number" min="1" max="100" class="input" />
          </label>
          <template v-else>
            <label>
              <span class="label">{{ t('promotions.buy') }}</span>
              <input v-model.number="form.buyQty" type="number" min="1" class="input" />
            </label>
            <label>
              <span class="label">{{ t('promotions.getFree') }}</span>
              <input v-model.number="form.getQty" type="number" min="1" class="input" />
            </label>
          </template>
          <label v-if="form.kind === 'spendOver'">
            <span class="label">{{
              t('promotions.minSpend', { currency: settings.s.currency })
            }}</span>
            <input v-model.number="form.minSpend" type="number" min="0" step="any" class="input" />
          </label>
        </div>

        <!-- Which items -->
        <div v-if="form.kind !== 'spendOver'" class="space-y-2">
          <span class="label">{{ t('promotions.items') }}</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in catalog.categories"
              :key="c.id"
              class="chip h-9"
              :class="form.categoryIds.includes(c.id) && 'chip-active'"
              :aria-pressed="form.categoryIds.includes(c.id)"
              @click="toggleIn(form.categoryIds, c.id)"
            >
              {{ c.name }}
            </button>
          </div>
          <input
            v-model="productQuery"
            class="input h-10"
            :placeholder="t('promotions.searchProducts')"
            :aria-label="t('promotions.searchProducts')"
          />
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in productMatches"
              :key="p.id"
              class="chip h-9"
              :class="form.productIds.includes(p.id) && 'chip-active'"
              :aria-pressed="form.productIds.includes(p.id)"
              @click="toggleIn(form.productIds, p.id)"
            >
              {{ p.emoji }} {{ p.name }}
            </button>
          </div>
          <p class="text-xs text-ink-muted">
            {{
              form.categoryIds.length || form.productIds.length
                ? t('promotions.itemsChosen', { items: itemsText(form) })
                : t('promotions.itemsAll')
            }}
          </p>
        </div>

        <!-- When -->
        <div class="space-y-2">
          <span class="label">{{ t('promotions.days') }}</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="d in dayOrder"
              :key="d"
              class="chip h-9 px-3"
              :class="form.days.includes(d) && 'chip-active'"
              :aria-pressed="form.days.includes(d)"
              @click="toggleIn(form.days, d)"
            >
              {{ dayName(d) }}
            </button>
          </div>
          <p class="text-xs text-ink-muted">{{ t('promotions.daysHelp') }}</p>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>
            <span class="label">{{ t('promotions.from') }}</span>
            <input v-model="form.timeFrom" type="time" class="input" />
          </label>
          <label>
            <span class="label">{{ t('promotions.to') }}</span>
            <input v-model="form.timeTo" type="time" class="input" />
          </label>
          <label>
            <span class="label">{{ t('promotions.startDate') }}</span>
            <input v-model="form.dateFrom" type="date" class="input" />
          </label>
          <label>
            <span class="label">{{ t('promotions.endDate') }}</span>
            <input v-model="form.dateTo" type="date" class="input" />
          </label>
        </div>

        <div v-if="auth.multiBranch" class="space-y-2">
          <span class="label">{{ t('branches.title') }}</span>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="b in auth.branches"
              :key="b.id"
              class="chip h-9"
              :class="form.branchIds.includes(b.id) && 'chip-active'"
              :aria-pressed="form.branchIds.includes(b.id)"
              @click="toggleIn(form.branchIds, b.id)"
            >
              {{ b.name }}
            </button>
          </div>
          <p class="text-xs text-ink-muted">{{ t('promotions.branchesHelp') }}</p>
        </div>

        <p class="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-muted">
          {{ t('promotions.rules') }}
        </p>
        <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>
      </div>
      <template #footer>
        <button
          v-if="form?.id"
          class="btn btn-danger"
          :aria-label="t('common.delete')"
          @click="confirmDelete = true"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="form = null">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary" @click="save">{{ t('common.save') }}</button>
      </template>
    </BaseModal>

    <BaseModal v-model="confirmDelete" :title="t('promotions.deleteTitle')" size="sm" top>
      <p class="text-sm text-ink-muted">{{ t('promotions.deleteBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmDelete = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="remove">{{ t('common.delete') }}</button>
      </template>
    </BaseModal>
  </div>
</template>
