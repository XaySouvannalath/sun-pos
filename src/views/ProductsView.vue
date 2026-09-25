<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref } from 'vue'
import { FileSpreadsheet, Plus, Search, Pencil, Trash2 } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import ProductEditor from '@/components/ProductEditor.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { tintClasses, tintNames } from '@/utils/tints'
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
const catForm = ref<Category>({ id: '', name: '', tint: 'sage', stationId: null })
const catError = ref('')

function editCat(c: Category | null) {
  catForm.value = c ? { ...c } : { id: '', name: '', tint: 'sage', stationId: null }
  catError.value = ''
  catOpen.value = true
}

async function saveCat() {
  if (!catForm.value.name.trim()) return
  await catalog.saveCategory({ ...catForm.value, name: catForm.value.name.trim() })
  catOpen.value = false
  toast.show(t('products.categorySaved'), 'success')
}

async function removeCat() {
  const err = await catalog.removeCategory(catForm.value.id)
  if (err) catError.value = err
  else {
    catOpen.value = false
    toast.show(t('products.categoryDeleted'))
  }
}

const countIn = (id: string) => catalog.products.filter((p) => p.categoryId === id).length
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">{{ t('nav.products') }}</h1>
      <div class="segmented">
        <button class="px-4" :aria-pressed="tab === 'products'" @click="tab = 'products'">
          {{ t('nav.products') }}
        </button>
        <button class="px-4" :aria-pressed="tab === 'categories'" @click="tab = 'categories'">
          {{ t('products.categories') }}
        </button>
      </div>
      <RouterLink
        v-if="tab === 'products'"
        :to="{ path: '/import', query: { type: 'products' } }"
        class="btn btn-outline"
      >
        <FileSpreadsheet class="size-4" /> {{ t('nav.import') }}
      </RouterLink>
      <button v-if="tab === 'products'" class="btn btn-primary" @click="edit(null)">
        <Plus class="size-4" /> {{ t('products.add') }}
      </button>
      <button v-else class="btn btn-primary" @click="editCat(null)">
        <Plus class="size-4" /> {{ t('products.addCategory') }}
      </button>
    </div>

    <template v-if="tab === 'products'">
      <div class="flex flex-wrap gap-3">
        <div class="relative min-w-60 flex-1">
          <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
          <input
            v-model="q"
            class="input pl-10"
            :placeholder="t('products.searchPlaceholder')"
            :aria-label="t('sell.searchLabel')"
          />
        </div>
        <select v-model="cat" class="input w-48" :aria-label="t('products.filterCategory')">
          <option value="all">{{ t('products.allCategories') }}</option>
          <option v-for="c in catalog.categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>

      <div class="card overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t('products.product') }}</th>
              <th class="hidden md:table-cell">{{ t('fields.category') }}</th>
              <th class="hidden lg:table-cell">{{ t('fields.sku') }}</th>
              <th class="text-right">{{ t('fields.price') }}</th>
              <th class="hidden text-right sm:table-cell">{{ t('products.margin') }}</th>
              <th class="text-right">{{ t('fields.stock') }}</th>
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
                      <span v-if="!p.active">{{ t('products.hidden') }} · </span
                      >{{
                        p.options.length
                          ? t('products.optionGroups', { n: p.options.length })
                          : t('products.noOptions')
                      }}
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
                  :aria-label="t('products.editItem', { name: p.name })"
                  @click="edit(p)"
                >
                  <Pencil class="size-4" />
                </button>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="7" class="py-12 text-center text-ink-muted">{{ t('products.none') }}</td>
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
          <span class="block text-xs text-ink-muted">{{
            t('products.count', { n: countIn(c.id) })
          }}</span>
        </span>
        <Pencil class="size-4 text-ink-muted" />
      </button>
    </div>

    <ProductEditor
      v-model="editorOpen"
      :product="editing"
      @saved="toast.show(t('products.saved'), 'success')"
      @deleted="toast.show(t('products.deleted'))"
    />

    <BaseModal
      v-model="catOpen"
      :title="catForm.id ? t('products.editCategory') : t('products.newCategory')"
      size="sm"
    >
      <div class="space-y-4">
        <div>
          <label class="label" for="cat-name">{{ t('fields.name') }}</label>
          <input id="cat-name" v-model="catForm.name" class="input" @keydown.enter="saveCat" />
        </div>
        <div>
          <span class="label">{{ t('products.colour') }}</span>
          <div class="flex gap-2">
            <button
              v-for="tint in tintNames"
              :key="tint"
              class="size-10 rounded-xl border-2"
              :class="[
                tintClasses[tint].tile,
                catForm.tint === tint ? 'border-primary' : 'border-transparent',
              ]"
              :aria-label="tint"
              :aria-pressed="catForm.tint === tint"
              @click="catForm.tint = tint"
            />
          </div>
        </div>
        <div>
          <label class="label" for="cat-station">{{ t('kitchen.sendTo') }}</label>
          <select id="cat-station" v-model="catForm.stationId" class="input">
            <option :value="null">{{ t('kitchen.noTicket') }}</option>
            <option v-for="st in catalog.stations" :key="st.id" :value="st.id">
              {{ st.name }}
            </option>
          </select>
          <p class="mt-1 text-xs text-ink-muted">{{ t('kitchen.sendToHelp') }}</p>
        </div>
        <p v-if="catError" class="text-sm text-danger">{{ catError }}</p>
      </div>
      <template #footer>
        <button v-if="catForm.id" class="btn btn-danger" @click="removeCat">
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="catOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary" :disabled="!catForm.name.trim()" @click="saveCat">
          {{ t('common.save') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
