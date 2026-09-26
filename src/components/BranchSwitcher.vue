<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, MapPin } from 'lucide-vue-next'
import { t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAppStore } from '@/stores/app'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useKitchenStore } from '@/stores/kitchen'
import { useSelfOrdersStore } from '@/stores/selfOrders'
import { useToastStore } from '@/stores/toast'

const open = defineModel<boolean>({ required: true })
const auth = useAuthStore()
const router = useRouter()
const busy = ref(false)

async function choose(id: string) {
  if (id === auth.branchId || busy.value) return
  busy.value = true
  try {
    // The order on screen belongs to this branch: save it here before leaving.
    const cart = useCartStore()
    if (!cart.isEmpty) await cart.hold()
    else cart.clear()
    await auth.switchBranch(id)
    // Stock, tables, bills, the shift and tickets are all per branch.
    await Promise.all([
      useAppStore().load(),
      useKitchenStore()
        .load()
        .catch(() => null),
      useSelfOrdersStore()
        .load()
        .catch(() => null),
    ])
    open.value = false
    useToastStore().show(t('branches.switched', { name: auth.branch?.name ?? '' }), 'success')
    await router.push('/')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal v-model="open" :title="t('branches.switchTitle')" size="sm">
    <p class="mb-3 text-sm text-ink-muted">{{ t('branches.switchHelp') }}</p>
    <ul class="space-y-2">
      <li v-for="b in auth.myBranches" :key="b.id">
        <button
          class="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition"
          :class="
            b.id === auth.branchId
              ? 'border-primary bg-primary-soft'
              : 'border-line hover:bg-surface-2'
          "
          :disabled="busy"
          @click="choose(b.id)"
        >
          <MapPin class="size-5 shrink-0 text-primary" />
          <span class="min-w-0 flex-1">
            <span class="block font-semibold">{{ b.name }}</span>
            <span v-if="b.address" class="block truncate text-xs text-ink-muted">{{
              b.address
            }}</span>
          </span>
          <Check v-if="b.id === auth.branchId" class="size-5 text-primary" />
        </button>
      </li>
    </ul>
  </BaseModal>
</template>
