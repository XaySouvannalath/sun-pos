<script setup lang="ts">
import { computed } from 'vue'
import { Flame, Plus } from 'lucide-vue-next'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import type { Product } from '@/types'

defineEmits<{ add: [p: Product] }>()

const orders = useOrdersStore()
const settings = useSettingsStore()
const top = computed(() => orders.topSellers(settings.s.topSellerDays, 8))

const medal = [
  'bg-accent text-primary-ink',
  'bg-ink-muted text-surface',
  'bg-accent/60 text-primary-ink',
]
</script>

<template>
  <section v-if="top.length" aria-labelledby="top-sellers">
    <div class="mb-2 flex items-center gap-2">
      <Flame class="size-4 text-accent" />
      <h2 id="top-sellers" class="text-sm font-semibold">Top sellers</h2>
      <span class="text-xs text-ink-muted"
        >last {{ settings.s.topSellerDays }} days · tap to add</span
      >
    </div>
    <div class="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2">
      <div
        v-for="(t, i) in top"
        :key="t.product.id"
        class="card flex w-64 shrink-0 snap-start items-center gap-3 p-2.5 pr-2"
      >
        <button
          class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
          :disabled="t.product.stock !== null && t.product.stock <= 0"
          @click="$emit('add', t.product)"
        >
          <span
            class="relative grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl"
          >
            {{ t.product.emoji }}
            <span
              class="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full text-[10px] font-bold"
              :class="medal[i] ?? 'bg-surface-2 text-ink-muted border border-line'"
              >{{ i + 1 }}</span
            >
          </span>
          <span class="min-w-0">
            <span class="line-clamp-2 block text-sm leading-tight font-semibold">{{
              t.product.name
            }}</span>
            <span class="block text-xs text-ink-muted">
              {{ settings.money(t.product.price) }} · {{ t.qty }} sold
            </span>
          </span>
        </button>
        <button
          class="btn btn-primary btn-sm btn-icon shrink-0 rounded-full"
          :aria-label="`Add ${t.product.name}`"
          :disabled="t.product.stock !== null && t.product.stock <= 0"
          @click="$emit('add', t.product)"
        >
          <Plus class="size-4" />
        </button>
      </div>
    </div>
  </section>
</template>
