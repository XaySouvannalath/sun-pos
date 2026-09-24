<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import { Plus, Trash2, X } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCatalogStore } from '@/stores/catalog'
import { clone, uid } from '@/utils/pos'
import type { Product } from '@/types'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ product: Product | null }>()
const emit = defineEmits<{ saved: [p: Product]; deleted: [] }>()

const catalog = useCatalogStore()
const form = ref<Product>(catalog.newProduct())
const trackStock = ref(false)
const isNew = ref(true)
const confirmDelete = ref(false)

const emojis = [
  '☕',
  '🧋',
  '🍵',
  '🥤',
  '🥭',
  '🍓',
  '🍋',
  '🍛',
  '🍜',
  '🥪',
  '🥗',
  '🍔',
  '🍕',
  '🍗',
  '🥐',
  '🍞',
  '🧁',
  '🍰',
  '🍨',
  '🍩',
  '🍺',
  '🍷',
  '💧',
  '🍽️',
]

watch(open, (o) => {
  if (!o) return
  isNew.value = !props.product
  // Edit a copy so changes don't leak into the catalog until saved.
  form.value = props.product ? clone(props.product) : catalog.newProduct()
  trackStock.value = form.value.stock !== null
})

function addGroup() {
  form.value.options.push({
    id: uid(),
    name: t('productEditor.defaultGroup'),
    multiple: false,
    required: true,
    choices: [{ name: t('productEditor.defaultChoice'), price: 0 }],
  })
}

const busy = ref(false)

async function save() {
  if (busy.value) return
  const p = form.value
  if (!p.name.trim()) return
  p.name = p.name.trim()
  p.price = Math.max(0, Number(p.price) || 0)
  p.cost = Math.max(0, Number(p.cost) || 0)
  p.lowStockAt = Math.max(0, Number(p.lowStockAt) || 0)
  p.stock = trackStock.value ? Math.floor(Number(p.stock) || 0) : null
  p.options = p.options
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      choices: g.choices
        .filter((c) => c.name.trim())
        .map((c) => ({ name: c.name.trim(), price: Number(c.price) || 0 })),
    }))
    .filter((g) => g.name && g.choices.length)
  busy.value = true
  try {
    const saved = await catalog.saveProduct(p)
    emit('saved', saved)
    open.value = false
  } finally {
    busy.value = false
  }
}

async function remove() {
  await catalog.removeProduct(form.value.id)
  confirmDelete.value = false
  open.value = false
  emit('deleted')
}
</script>

<template>
  <BaseModal
    v-model="open"
    :title="isNew ? t('productEditor.new') : t('productEditor.edit')"
    size="lg"
  >
    <form id="product-form" class="space-y-5" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <span class="label">{{ t('fields.icon') }}</span>
          <details class="relative">
            <summary
              class="grid size-20 cursor-pointer list-none place-items-center rounded-2xl border border-line bg-surface-2 text-4xl"
            >
              {{ form.emoji }}
            </summary>
            <div
              class="absolute z-10 mt-2 grid w-64 grid-cols-6 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lg"
            >
              <button
                v-for="e in emojis"
                :key="e"
                type="button"
                class="grid size-9 place-items-center rounded-lg text-xl hover:bg-surface-2"
                @click="form.emoji = e"
              >
                {{ e }}
              </button>
            </div>
          </details>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label" for="p-name">{{ t('fields.name') }} *</label>
            <input id="p-name" v-model="form.name" class="input" required />
          </div>
          <div>
            <label class="label" for="p-cat">{{ t('fields.category') }}</label>
            <select id="p-cat" v-model="form.categoryId" class="input">
              <option v-for="c in catalog.categories" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
          <label class="flex items-end gap-2 pb-3 text-sm">
            <input v-model="form.active" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
            {{ t('productEditor.showOnSell') }}
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label class="label" for="p-price">{{ t('fields.price') }} *</label>
          <input
            id="p-price"
            v-model.number="form.price"
            type="number"
            step="any"
            min="0"
            class="input"
            required
          />
        </div>
        <div>
          <label class="label" for="p-cost">{{ t('fields.cost') }}</label>
          <input
            id="p-cost"
            v-model.number="form.cost"
            type="number"
            step="any"
            min="0"
            class="input"
          />
        </div>
        <div>
          <label class="label" for="p-sku">{{ t('fields.sku') }}</label>
          <input id="p-sku" v-model="form.sku" class="input" />
        </div>
        <div>
          <label class="label" for="p-bar">{{ t('fields.barcode') }}</label>
          <input id="p-bar" v-model="form.barcode" class="input" />
        </div>
      </div>

      <div class="rounded-2xl border border-line p-4">
        <label class="flex items-center gap-2 text-sm font-semibold">
          <input v-model="trackStock" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
          {{ t('productEditor.trackStock') }}
        </label>
        <div v-if="trackStock" class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="p-stock">{{ t('productEditor.inStock') }}</label>
            <input id="p-stock" v-model.number="form.stock" type="number" class="input" />
          </div>
          <div>
            <label class="label" for="p-low">{{ t('productEditor.lowAt') }}</label>
            <input
              id="p-low"
              v-model.number="form.lowStockAt"
              type="number"
              min="0"
              class="input"
            />
          </div>
        </div>
        <p v-else class="mt-1 text-xs text-ink-muted">{{ t('productEditor.noTrackHint') }}</p>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold">{{ t('productEditor.options') }}</h3>
          <button type="button" class="btn btn-soft btn-sm" @click="addGroup">
            <Plus class="size-4" /> {{ t('productEditor.addGroup') }}
          </button>
        </div>
        <p v-if="!form.options.length" class="text-xs text-ink-muted">
          {{ t('productEditor.optionsHint') }}
        </p>
        <div
          v-for="(g, gi) in form.options"
          :key="g.id"
          class="mb-3 space-y-2 rounded-2xl border border-line p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <input
              v-model="g.name"
              class="input h-9 flex-1"
              :placeholder="t('productEditor.groupName')"
              :aria-label="t('productEditor.groupName')"
            />
            <label class="flex items-center gap-1.5 text-xs"
              ><input v-model="g.required" type="checkbox" class="accent-[var(--c-primary)]" />
              {{ t('common.required') }}</label
            >
            <label class="flex items-center gap-1.5 text-xs"
              ><input v-model="g.multiple" type="checkbox" class="accent-[var(--c-primary)]" />
              {{ t('productEditor.multiple') }}</label
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              :aria-label="t('productEditor.removeGroup')"
              @click="form.options.splice(gi, 1)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
          <div v-for="(c, ci) in g.choices" :key="ci" class="flex gap-2">
            <input
              v-model="c.name"
              class="input h-9 flex-1"
              :placeholder="t('productEditor.choice')"
              :aria-label="t('productEditor.choiceName')"
            />
            <input
              v-model.number="c.price"
              type="number"
              step="any"
              class="input h-9 w-28"
              :placeholder="t('productEditor.pricePlaceholder')"
              :aria-label="t('productEditor.extraPrice')"
            />
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              :aria-label="t('productEditor.removeChoice')"
              @click="g.choices.splice(ci, 1)"
            >
              <X class="size-4" />
            </button>
          </div>
          <button
            type="button"
            class="text-xs font-semibold text-primary"
            @click="g.choices.push({ name: '', price: 0 })"
          >
            + {{ t('productEditor.addChoice') }}
          </button>
        </div>
      </div>
    </form>

    <template #footer>
      <button v-if="!isNew" class="btn btn-danger" @click="confirmDelete = true">
        <Trash2 class="size-4" /> {{ t('common.delete') }}
      </button>
      <button class="btn btn-soft ml-auto" @click="open = false">{{ t('common.cancel') }}</button>
      <button
        type="submit"
        form="product-form"
        class="btn btn-primary"
        :disabled="!form.name.trim() || busy"
      >
        {{ busy ? t('common.saving') : t('productEditor.save') }}
      </button>
    </template>

    <BaseModal v-model="confirmDelete" :title="t('productEditor.deleteTitle')" size="sm">
      <p class="text-sm text-ink-muted">
        {{
          t('productEditor.deleteBody', { name: form.name, show: t('productEditor.showOnSell') })
        }}
      </p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmDelete = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="remove">{{ t('common.delete') }}</button>
      </template>
    </BaseModal>
  </BaseModal>
</template>
