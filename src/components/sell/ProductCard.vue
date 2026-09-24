<script setup lang="ts">
import { computed } from 'vue'
import { SlidersHorizontal } from 'lucide-vue-next'
import { useCatalogStore } from '@/stores/catalog'
import { useSettingsStore } from '@/stores/settings'
import { tintClasses } from '@/utils/tints'
import type { Product } from '@/types'

const props = defineProps<{ product: Product; inCart?: number }>()
defineEmits<{ add: [el: HTMLElement]; customize: [] }>()

const catalog = useCatalogStore()
const settings = useSettingsStore()

const tint = computed(
  () => tintClasses[catalog.categoryById.get(props.product.categoryId)?.tint ?? 'sand'],
)
const soldOut = computed(() => props.product.stock !== null && props.product.stock <= 0)
const low = computed(
  () =>
    props.product.stock !== null &&
    !soldOut.value &&
    props.product.stock <= props.product.lowStockAt,
)
</script>

<template>
  <div class="group relative">
    <button
      class="card lift flex h-full w-full flex-col overflow-hidden text-left hover:border-primary/60 active:scale-[0.98] disabled:opacity-50"
      :disabled="soldOut"
      @click="$emit('add', $event.currentTarget as HTMLElement)"
    >
      <div class="grid h-20 w-full place-items-center text-4xl" :class="tint.tile">
        <span aria-hidden="true">{{ product.emoji }}</span>
      </div>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <span class="line-clamp-2 text-sm leading-snug font-semibold">{{ product.name }}</span>
        <div class="mt-auto flex items-center justify-between gap-2">
          <span class="text-sm font-bold text-primary">{{ settings.money(product.price) }}</span>
          <span v-if="soldOut" class="badge bg-danger-soft text-danger">Sold out</span>
          <span v-else-if="low" class="badge bg-accent-soft text-accent"
            >{{ product.stock }} left</span
          >
        </div>
      </div>
    </button>
    <span
      v-if="inCart"
      class="pointer-events-none absolute top-2 left-2 grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-ink shadow"
      >{{ inCart }}</span
    >
    <button
      v-if="product.options.length && !soldOut"
      class="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-surface/90 text-ink-muted shadow-sm hover:text-primary"
      title="Choose options"
      @click="$emit('customize')"
    >
      <SlidersHorizontal class="size-4" />
    </button>
  </div>
</template>
