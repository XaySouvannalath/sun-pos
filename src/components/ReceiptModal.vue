<script setup lang="ts">
import { Printer, CircleCheck } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import OrderReceipt from '@/components/OrderReceipt.vue'
import { useSettingsStore } from '@/stores/settings'
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
        <CircleCheck class="mx-auto size-14 text-success" />
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
      <button class="btn btn-soft flex-1" @click="print"><Printer class="size-4" /> Print</button>
      <button class="btn btn-primary flex-1" @click="open = false">
        {{ justPaid ? 'New order' : 'Close' }}
      </button>
    </template>
  </BaseModal>
</template>
