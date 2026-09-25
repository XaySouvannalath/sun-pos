<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Users } from 'lucide-vue-next'
import { t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useFloorStore } from '@/stores/floor'
import { useToastStore } from '@/stores/toast'
import type { DiningTable } from '@/types'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const floor = useFloorStore()
const toast = useToastStore()

/** An order that already has items and a table is moved, not just labelled. */
const moving = computed(() => !!cart.state.tableId && !cart.isEmpty)
const title = computed(() =>
  moving.value ? t('tables.moveOrder', { n: cart.state.table }) : t('tables.chooseTable'),
)

const areaId = ref('')
watch(open, (o) => {
  if (!o) return
  void cart.loadHeld().catch(() => null)
  const current = cart.state.tableId ? floor.tableById.get(cart.state.tableId) : undefined
  areaId.value = current?.areaId ?? floor.plan.areas[0]?.id ?? ''
})

const tables = computed(() =>
  floor.plan.tables
    .filter((tb) => tb.areaId === areaId.value)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
)
/** A table with another open bill can't take this order (merge it from Tables instead). */
const busy = (tb: DiningTable) => {
  const bill = cart.heldForTable(tb.id)
  return !!bill && bill.id !== cart.state.heldId
}

async function choose(tb: DiningTable | null) {
  if (tb && moving.value && tb.id !== cart.state.tableId) {
    const from = floor.tableById.get(cart.state.tableId!)
    await cart.moveTo(tb)
    toast.show(
      t('tables.moved', { from: from?.name ?? '', to: tb.name }),
      'success',
      6000,
      from && {
        label: t('tables.undo'),
        run: () => cart.moveTo(from),
      },
    )
  } else cart.setTable(tb)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="title" size="md">
    <div v-if="floor.plan.areas.length > 1" class="segmented mb-4">
      <button
        v-for="a in floor.plan.areas"
        :key="a.id"
        :aria-pressed="areaId === a.id"
        @click="areaId = a.id"
      >
        {{ a.name }}
      </button>
    </div>
    <p v-if="moving" class="mb-3 text-sm text-ink-muted">{{ t('tables.moveOrderHelp') }}</p>
    <div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
      <button
        v-for="tb in tables"
        :key="tb.id"
        class="flex h-16 flex-col items-center justify-center rounded-xl border-2 text-sm transition"
        :class="[
          cart.state.tableId === tb.id
            ? 'border-primary bg-primary-soft'
            : 'border-line hover:border-primary',
          busy(tb) && 'pointer-events-none opacity-45',
        ]"
        :disabled="busy(tb)"
        @click="choose(tb)"
      >
        <span class="text-base font-bold">{{ tb.name }}</span>
        <span v-if="busy(tb)" class="text-[11px] text-ink-muted">{{ t('tables.busyShort') }}</span>
        <span v-else class="flex items-center gap-0.5 text-[11px] text-ink-muted"
          ><Users class="size-3" /> {{ tb.seats }}</span
        >
      </button>
    </div>
    <template #footer>
      <button v-if="cart.state.tableId" class="btn btn-soft" @click="choose(null)">
        {{ t('tables.noTable') }}
      </button>
      <RouterLink to="/tables" class="btn btn-ghost ml-auto" @click="open = false">
        {{ t('tables.openMap') }}
      </RouterLink>
    </template>
  </BaseModal>
</template>
