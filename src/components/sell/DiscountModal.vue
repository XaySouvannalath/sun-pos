<script setup lang="ts">
import { t } from '@/i18n'
import { ref, watch } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import type { DiscountType } from '@/types'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const settings = useSettingsStore()

const type = ref<DiscountType>('percent')
const value = ref(0)

watch(open, (o) => {
  if (!o) return
  type.value = cart.state.discount.type
  value.value = cart.state.discount.value
})

function apply(v = value.value) {
  cart.state.discount = { type: type.value, value: Math.max(0, Number(v) || 0) }
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="t('discount.title')" size="sm">
    <div class="space-y-4">
      <div class="segmented">
        <button :aria-pressed="type === 'percent'" @click="type = 'percent'">
          {{ t('discount.percent') }}
        </button>
        <button :aria-pressed="type === 'amount'" @click="type = 'amount'">
          {{ t('discount.amount', { currency: settings.s.currency }) }}
        </button>
      </div>
      <div v-if="type === 'percent'" class="grid grid-cols-4 gap-2">
        <button
          v-for="p in [5, 10, 15, 20, 25, 30, 50, 100]"
          :key="p"
          class="btn btn-soft"
          @click="apply(p)"
        >
          {{ p }}%
        </button>
      </div>
      <div>
        <label class="label" for="disc">{{ t('discount.custom') }}</label>
        <input
          id="disc"
          v-model.number="value"
          type="number"
          min="0"
          class="input text-lg"
          @keydown.enter="apply()"
        />
      </div>
    </div>
    <template #footer>
      <button class="btn btn-soft" @click="apply(0)">{{ t('discount.remove') }}</button>
      <button class="btn btn-primary flex-1" @click="apply()">{{ t('discount.apply') }}</button>
    </template>
  </BaseModal>
</template>
