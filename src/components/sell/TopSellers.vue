<script setup lang="ts">
import { t } from '@/i18n'
import { computed } from 'vue'
import { Flame, Plus } from 'lucide-vue-next'
import { useOrdersStore } from '@/stores/orders'
import { useSettingsStore } from '@/stores/settings'
import type { Product } from '@/types'

defineEmits<{ add: [p: Product, el: HTMLElement] }>()

const orders = useOrdersStore()
const settings = useSettingsStore()
const top = computed(() => orders.topSellers)

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
      <h2 id="top-sellers" class="text-sm font-semibold">{{ t('sell.topSellers') }}</h2>
      <span class="text-xs text-ink-muted">{{
        t('sell.topSellersHint', { n: settings.s.topSellerDays })
      }}</span>
    </div>
    <div class="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2">
      <div
        v-for="(item, i) in top"
        :key="item.product.id"
        class="card lift flex w-64 shrink-0 snap-start items-center gap-3 p-2.5 pr-2"
      >
        <button
          class="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
          :disabled="item.product.stock !== null && item.product.stock <= 0"
          @click="$emit('add', item.product, $event.currentTarget as HTMLElement)"
        >
          <span
            class="relative grid size-12 shrink-0 place-items-center rounded-xl bg-surface-2 text-2xl"
          >
            {{ item.product.emoji }}
            <span
              class="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full text-[10px] font-bold"
              :class="medal[i] ?? 'bg-surface-2 text-ink-muted border border-line'"
              >{{ i + 1 }}</span
            >
          </span>
          <span class="min-w-0">
            <span class="line-clamp-2 block text-sm leading-tight font-semibold">{{
              item.product.name
            }}</span>
            <span class="block text-xs text-ink-muted">
              {{ settings.money(item.product.price) }} · {{ t('sell.sold', { n: item.qty }) }}
            </span>
          </span>
        </button>
        <button
          class="btn btn-primary btn-sm btn-icon shrink-0 rounded-full"
          :aria-label="t('sell.addItem', { name: item.product.name })"
          :disabled="item.product.stock !== null && item.product.stock <= 0"
          @click="$emit('add', item.product, $event.currentTarget as HTMLElement)"
        >
          <Plus class="size-4" />
        </button>
      </div>
    </div>
  </section>
</template>
