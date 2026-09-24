<script setup lang="ts">
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
    name: 'Size',
    multiple: false,
    required: true,
    choices: [{ name: 'Regular', price: 0 }],
  })
}

function save() {
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
  catalog.saveProduct(p)
  emit('saved', p)
  open.value = false
}

function remove() {
  catalog.removeProduct(form.value.id)
  confirmDelete.value = false
  open.value = false
  emit('deleted')
}
</script>

<template>
  <BaseModal v-model="open" :title="isNew ? 'New product' : 'Edit product'" size="lg">
    <form id="product-form" class="space-y-5" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div>
          <span class="label">Icon</span>
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
            <label class="label" for="p-name">Name *</label>
            <input id="p-name" v-model="form.name" class="input" required />
          </div>
          <div>
            <label class="label" for="p-cat">Category</label>
            <select id="p-cat" v-model="form.categoryId" class="input">
              <option v-for="c in catalog.categories" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
          <label class="flex items-end gap-2 pb-3 text-sm">
            <input v-model="form.active" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
            Show on sell screen
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label class="label" for="p-price">Price *</label>
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
          <label class="label" for="p-cost">Cost</label>
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
          <label class="label" for="p-sku">SKU</label>
          <input id="p-sku" v-model="form.sku" class="input" />
        </div>
        <div>
          <label class="label" for="p-bar">Barcode</label>
          <input id="p-bar" v-model="form.barcode" class="input" />
        </div>
      </div>

      <div class="rounded-2xl border border-line p-4">
        <label class="flex items-center gap-2 text-sm font-semibold">
          <input v-model="trackStock" type="checkbox" class="size-4 accent-[var(--c-primary)]" />
          Track stock for this item
        </label>
        <div v-if="trackStock" class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label class="label" for="p-stock">In stock</label>
            <input id="p-stock" v-model.number="form.stock" type="number" class="input" />
          </div>
          <div>
            <label class="label" for="p-low">Low stock alert at</label>
            <input
              id="p-low"
              v-model.number="form.lowStockAt"
              type="number"
              min="0"
              class="input"
            />
          </div>
        </div>
        <p v-else class="mt-1 text-xs text-ink-muted">Good for made-to-order drinks and dishes.</p>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold">Options & modifiers</h3>
          <button type="button" class="btn btn-soft btn-sm" @click="addGroup">
            <Plus class="size-4" /> Add group
          </button>
        </div>
        <p v-if="!form.options.length" class="text-xs text-ink-muted">
          e.g. Size, Sweetness, Extra toppings.
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
              placeholder="Group name"
              aria-label="Group name"
            />
            <label class="flex items-center gap-1.5 text-xs"
              ><input v-model="g.required" type="checkbox" class="accent-[var(--c-primary)]" />
              Required</label
            >
            <label class="flex items-center gap-1.5 text-xs"
              ><input v-model="g.multiple" type="checkbox" class="accent-[var(--c-primary)]" />
              Multiple</label
            >
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              aria-label="Remove group"
              @click="form.options.splice(gi, 1)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
          <div v-for="(c, ci) in g.choices" :key="ci" class="flex gap-2">
            <input
              v-model="c.name"
              class="input h-9 flex-1"
              placeholder="Choice"
              aria-label="Choice name"
            />
            <input
              v-model.number="c.price"
              type="number"
              step="any"
              class="input h-9 w-28"
              placeholder="+ price"
              aria-label="Extra price"
            />
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-icon"
              aria-label="Remove choice"
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
            + Add choice
          </button>
        </div>
      </div>
    </form>

    <template #footer>
      <button v-if="!isNew" class="btn btn-danger" @click="confirmDelete = true">
        <Trash2 class="size-4" /> Delete
      </button>
      <button class="btn btn-soft ml-auto" @click="open = false">Cancel</button>
      <button
        type="submit"
        form="product-form"
        class="btn btn-primary"
        :disabled="!form.name.trim()"
      >
        Save product
      </button>
    </template>

    <BaseModal v-model="confirmDelete" title="Delete product?" size="sm">
      <p class="text-sm text-ink-muted">
        “{{ form.name }}” will be removed. Past orders keep their records. To hide it temporarily,
        untick “Show on sell screen” instead.
      </p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmDelete = false">Cancel</button>
        <button class="btn btn-danger flex-1" @click="remove">Delete</button>
      </template>
    </BaseModal>
  </BaseModal>
</template>
