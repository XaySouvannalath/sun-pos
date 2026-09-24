<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, Search, Pencil, Trash2 } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import ProductEditor from '@/components/ProductEditor.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { tintClasses, tintNames } from '@/utils/tints'
import { uid } from '@/utils/pos'
import type { Category, Product } from '@/types'

const catalog = useCatalogStore()
const settings = useSettingsStore()
const toast = useToastStore()

const tab = ref<'products' | 'categories'>('products')
const q = ref('')
const cat = ref('all')
const editorOpen = ref(false)
const editing = ref<Product | null>(null)

const list = computed(() => {
  const s = q.value.trim().toLowerCase()
  return catalog.products.filter(
    (p) =>
      (cat.value === 'all' || p.categoryId === cat.value) &&
      (!s ||
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        p.barcode.includes(s)),
  )
})

function edit(p: Product | null) {
  editing.value = p
  editorOpen.value = true
}

const margin = (p: Product) => (p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : 0)

// Categories
const catOpen = ref(false)
const catForm = ref<Category>({ id: '', name: '', tint: 'sage' })
const catError = ref('')

function editCat(c: Category | null) {
  catForm.value = c ? { ...c } : { id: uid(), name: '', tint: 'sage' }
  catError.value = ''
  catOpen.value = true
}

function saveCat() {
  if (!catForm.value.name.trim()) return
  catalog.saveCategory({ ...catForm.value, name: catForm.value.name.trim() })
  catOpen.value = false
  toast.show('Category saved', 'success')
}

function removeCat() {
  const err = catalog.removeCategory(catForm.value.id)
  if (err) catError.value = err
  else {
    catOpen.value = false
    toast.show('Category deleted')
  }
}

const countIn = (id: string) => catalog.products.filter((p) => p.categoryId === id).length
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">Products</h1>
      <div class="segmented">
        <button class="px-4" :aria-pressed="tab === 'products'" @click="tab = 'products'">
          Products
        </button>
        <button class="px-4" :aria-pressed="tab === 'categories'" @click="tab = 'categories'">
          Categories
        </button>
      </div>
      <button v-if="tab === 'products'" class="btn btn-primary" @click="edit(null)">
        <Plus class="size-4" /> Add product
      </button>
      <button v-else class="btn btn-primary" @click="editCat(null)">
        <Plus class="size-4" /> Add category
      </button>
    </div>

    <template v-if="tab === 'products'">
      <div class="flex flex-wrap gap-3">
        <div class="relative min-w-60 flex-1">
          <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
          <input
            v-model="q"
            class="input pl-10"
            placeholder="Search name, SKU, barcode"
            aria-label="Search products"
          />
        </div>
        <select v-model="cat" class="input w-48" aria-label="Filter by category">
          <option value="all">All categories</option>
          <option v-for="c in catalog.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="card overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Product</th>
              <th class="hidden md:table-cell">Category</th>
              <th class="hidden lg:table-cell">SKU</th>
              <th class="text-right">Price</th>
              <th class="hidden text-right sm:table-cell">Margin</th>
              <th class="text-right">Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in list"
              :key="p.id"
              class="hover:bg-surface-2/60"
              :class="!p.active && 'opacity-55'"
            >
              <td>
                <div class="flex items-center gap-3">
                  <span
                    class="grid size-10 place-items-center rounded-xl text-xl"
                    :class="
                      tintClasses[catalog.categoryById.get(p.categoryId)?.tint ?? 'sand'].tile
                    "
                    >{{ p.emoji }}</span
                  >
                  <div>
                    <p class="font-medium">{{ p.name }}</p>
                    <p class="text-xs text-ink-muted">
                      <span v-if="!p.active">Hidden · </span
                      >{{ p.options.length ? `${p.options.length} option groups` : 'No options' }}
                    </p>
                  </div>
                </div>
              </td>
              <td class="hidden text-ink-muted md:table-cell">
                {{ catalog.categoryById.get(p.categoryId)?.name ?? '—' }}
              </td>
              <td class="hidden font-mono text-xs text-ink-muted lg:table-cell">{{ p.sku }}</td>
              <td class="text-right font-semibold">{{ settings.money(p.price) }}</td>
              <td class="hidden text-right text-ink-muted sm:table-cell">{{ margin(p) }}%</td>
              <td class="text-right">
                <span v-if="p.stock === null" class="text-ink-muted">—</span>
                <span v-else :class="p.stock <= p.lowStockAt ? 'font-semibold text-danger' : ''">{{
                  p.stock
                }}</span>
              </td>
              <td class="text-right">
                <button
                  class="btn btn-ghost btn-sm btn-icon"
                  :aria-label="`Edit ${p.name}`"
                  @click="edit(p)"
                >
                  <Pencil class="size-4" />
                </button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="7" class="py-12 text-center text-ink-muted">No products found.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <button
        v-for="c in catalog.categories"
        :key="c.id"
        class="card flex items-center gap-3 p-4 text-left hover:border-primary/60"
        @click="editCat(c)"
      >
        <span class="size-10 rounded-xl" :class="tintClasses[c.tint].tile" />
        <span class="flex-1">
          <span class="block font-semibold">{{ c.name }}</span>
          <span class="block text-xs text-ink-muted">{{ countIn(c.id) }} products</span>
        </span>
        <Pencil class="size-4 text-ink-muted" />
      </button>
    </div>

    <ProductEditor
      v-model="editorOpen"
      :product="editing"
      @saved="toast.show('Product saved', 'success')"
      @deleted="toast.show('Product deleted')"
    />

    <BaseModal
      v-model="catOpen"
      :title="catalog.categoryById.has(catForm.id) ? 'Edit category' : 'New category'"
      size="sm"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="cat-name">Name</label>
          <input id="cat-name" v-model="catForm.name" class="input" @keydown.enter="saveCat" />
        </div>
        <div>
          <span class="label">Colour</span>
          <div class="flex gap-2">
            <button
              v-for="t in tintNames"
              :key="t"
              class="size-10 rounded-xl border-2"
              :class="[
                tintClasses[t].tile,
                catForm.tint === t ? 'border-primary' : 'border-transparent',
              ]"
              :aria-label="t"
              :aria-pressed="catForm.tint === t"
              @click="catForm.tint = t"
            />
          </div>
        </div>
        <p v-if="catError" class="text-sm text-danger">{{ catError }}</p>
      </div>
      <template #footer>
        <button
          v-if="catalog.categoryById.has(catForm.id)"
          class="btn btn-danger"
          @click="removeCat"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="catOpen = false">Cancel</button>
        <button class="btn btn-primary" :disabled="!catForm.name.trim()" @click="saveCat">
          Save
        </button>
      </template>
    </BaseModal>
  </div>
</template>
