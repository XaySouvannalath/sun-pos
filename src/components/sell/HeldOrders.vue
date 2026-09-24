<script setup lang="ts">
import { Trash2, CirclePlay } from 'lucide-vue-next'
import { fmtTime, t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { computeTotals } from '@/utils/pos'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const settings = useSettingsStore()

async function resume(id: string) {
  await cart.resume(id)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="t('held.title')" size="md">
    <ul v-if="cart.held.length" class="space-y-2">
      <li v-for="h in cart.held" :key="h.id" class="card flex items-center gap-3 p-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{{ h.label }}</p>
          <p class="truncate text-xs text-ink-muted">
            {{ fmtTime(h.heldAt) }} ·
            {{ t('common.items', { n: h.lines.reduce((s, l) => s + l.qty, 0) }) }} ·
            {{ h.lines.map((l) => l.name).join(', ') }}
          </p>
        </div>
        <span class="font-bold">{{
          settings.money(computeTotals(h.lines, h.discount, settings.s).total)
        }}</span>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          :aria-label="t('held.discard')"
          @click="cart.discardHeld(h.id)"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-primary btn-sm" @click="resume(h.id)">
          <CirclePlay class="size-4" /> {{ t('held.resume') }}
        </button>
      </li>
    </ul>
    <p v-else class="py-10 text-center text-sm text-ink-muted">
      {{ t('held.empty') }}
    </p>
  </BaseModal>
</template>
