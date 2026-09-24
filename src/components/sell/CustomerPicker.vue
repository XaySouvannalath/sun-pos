<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { Search, UserPlus, Star } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import CustomerForm from '@/components/CustomerForm.vue'
import { useCartStore } from '@/stores/cart'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const customers = useCustomersStore()
const settings = useSettingsStore()

const q = ref('')
const adding = ref(false)
watch(open, (o) => {
  if (o) {
    q.value = ''
    adding.value = false
  }
})

const results = computed(() => customers.search(q.value).slice(0, 30))

async function addAndPick(d: Parameters<typeof customers.save>[0]) {
  const c = await customers.save(d)
  pick(c.id)
}

function pick(id: string | null) {
  cart.state.customerId = id
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="t('customerPicker.title')" size="md">
    <CustomerForm
      v-if="adding"
      :submit-label="t('customerPicker.addSelect')"
      @cancel="adding = false"
      @submit="addAndPick"
    />
    <div v-else class="space-y-3">
      <div class="flex gap-2">
        <div class="relative flex-1">
          <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
          <input
            v-model="q"
            class="input pl-10"
            :placeholder="t('customerPicker.search')"
            autofocus
            :aria-label="t('customers.searchLabel')"
          />
        </div>
        <button class="btn btn-soft" @click="adding = true">
          <UserPlus class="size-4" /> {{ t('common.new') }}
        </button>
      </div>
      <ul class="divide-y divide-line/70">
        <li v-for="c in results" :key="c.id">
          <button
            class="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-surface-2"
            :class="cart.state.customerId === c.id && 'bg-primary-soft'"
            @click="pick(c.id)"
          >
            <span
              class="grid size-10 place-items-center rounded-full bg-accent-soft font-bold text-accent"
              >{{ c.name.charAt(0) }}</span
            >
            <span class="flex-1">
              <span class="block font-medium">{{ c.name }}</span>
              <span class="block text-xs text-ink-muted">{{ c.phone || c.email || '—' }}</span>
            </span>
            <span class="text-right text-xs text-ink-muted">
              <span class="flex items-center gap-1 font-semibold text-accent"
                ><Star class="size-3" /> {{ t('customers.pts', { n: c.points }) }}</span
              >
              {{ settings.money(c.totalSpent) }}
            </span>
          </button>
        </li>
        <li v-if="!results.length" class="py-8 text-center text-sm text-ink-muted">
          {{ t('customerPicker.none') }}
          <button class="font-semibold text-primary" @click="adding = true">
            {{ t('customerPicker.addOne') }}
          </button>
        </li>
      </ul>
    </div>
    <template v-if="!adding && cart.state.customerId" #footer>
      <button class="btn btn-soft flex-1" @click="pick(null)">
        {{ t('customerPicker.removeFromOrder') }}
      </button>
    </template>
  </BaseModal>
</template>
