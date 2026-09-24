<script setup lang="ts">
import { Trash2, CirclePlay } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { computeTotals } from '@/utils/pos'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const settings = useSettingsStore()

const time = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function resume(id: string) {
  cart.resume(id)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" title="Held orders" size="md">
    <ul v-if="cart.held.length" class="space-y-2">
      <li v-for="h in cart.held" :key="h.id" class="card flex items-center gap-3 p-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold">{{ h.label }}</p>
          <p class="truncate text-xs text-ink-muted">
            {{ time(h.heldAt) }} · {{ h.lines.reduce((s, l) => s + l.qty, 0) }} items ·
            {{ h.lines.map((l) => l.name).join(', ') }}
          </p>
        </div>
        <span class="font-bold">{{
          settings.money(computeTotals(h.lines, h.discount, settings.s).total)
        }}</span>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          aria-label="Discard"
          @click="cart.discardHeld(h.id)"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-primary btn-sm" @click="resume(h.id)">
          <CirclePlay class="size-4" /> Resume
        </button>
      </li>
    </ul>
    <p v-else class="py-10 text-center text-sm text-ink-muted">
      No held orders. Use <b>Hold</b> to park an order and serve the next customer.
    </p>
  </BaseModal>
</template>
