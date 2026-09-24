<script setup lang="ts">
import { Printer } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import OrderReceipt from '@/components/OrderReceipt.vue'
import { useSettingsStore } from '@/stores/settings'
import { canPrint } from '@/utils/env'
import type { Order } from '@/types'

const open = defineModel<boolean>({ required: true })
defineProps<{ order: Order | null; justPaid?: boolean }>()
const settings = useSettingsStore()

function print() {
  window.print()
}
</script>

<template>
  <BaseModal v-model="open" size="md" :title="justPaid ? undefined : 'Receipt'">
    <div v-if="order">
      <div v-if="justPaid" class="mb-5 text-center">
        <!-- Circle, then tick, drawn in sequence -->
        <svg viewBox="0 0 56 56" class="anim-pop mx-auto size-14 text-success" aria-hidden="true">
          <circle
            cx="28"
            cy="28"
            r="25"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            class="anim-draw"
            style="--len: 158"
          />
          <path
            d="M17 29 l7 7 l15 -16"
            fill="none"
            stroke="currentColor"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="anim-draw"
            style="--len: 36; animation-delay: 0.25s"
          />
        </svg>
        <p class="mt-2 text-xl font-bold">Payment complete</p>
        <p v-if="order.change" class="mt-1 text-lg">
          Change due: <b class="text-success">{{ settings.money(order.change) }}</b>
        </p>
      </div>
      <div class="rounded-2xl bg-surface-2 p-4">
        <OrderReceipt :order="order" />
      </div>
    </div>
    <template #footer>
      <button v-if="canPrint" class="btn btn-soft flex-1" @click="print">
        <Printer class="size-4" /> Print
      </button>
      <button class="btn btn-primary flex-1" @click="open = false">
        {{ justPaid ? 'New order' : 'Close' }}
      </button>
    </template>
  </BaseModal>
</template>
