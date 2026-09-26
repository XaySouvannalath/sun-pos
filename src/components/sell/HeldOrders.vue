<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Trash2, CirclePlay, Merge, Check } from 'lucide-vue-next'
import { fmtTime, t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import type { HeldOrder } from '@/types'

const open = defineModel<boolean>({ required: true })
const cart = useCartStore()
const settings = useSettingsStore()
const toast = useToastStore()

// Merge bill: pick held orders to combine into the order on screen.
const merging = ref(false)
const picked = ref<string[]>([])
const busy = ref(false)

watch(open, () => {
  merging.value = false
  picked.value = []
})

// Merging needs two bills: the current order plus one held, or two held.
const canMerge = computed(() => cart.waiting.length >= (cart.isEmpty ? 2 : 1))
const onScreen = (id: string) => id === cart.state.heldId
const title = (h: HeldOrder) => (h.tableId ? t('cart.tableN', { n: h.table }) : h.label)
const enough = computed(() => picked.value.length >= (cart.isEmpty ? 2 : 1))

function togglePick(id: string) {
  picked.value = picked.value.includes(id)
    ? picked.value.filter((x) => x !== id)
    : [...picked.value, id]
}

async function resume(id: string) {
  await cart.resume(id)
  open.value = false
}

async function merge() {
  if (!enough.value || busy.value) return
  busy.value = true
  try {
    // Oldest first, so tables read in the order the bills were opened ("5 + 6").
    const ids = [...cart.waiting]
      .reverse()
      .filter((h) => picked.value.includes(h.id))
      .map((h) => h.id)
    await cart.mergeHeld(ids)
    toast.show(t('held.merged', { n: ids.length }), 'success')
    open.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseModal v-model="open" :title="merging ? t('held.mergeTitle') : t('held.title')" size="md">
    <p v-if="merging" class="mb-3 text-sm text-ink-muted">
      {{ cart.isEmpty ? t('held.mergeHelpEmpty') : t('held.mergeHelp') }}
    </p>
    <ul v-if="cart.held.length" class="space-y-2">
      <li
        v-for="h in cart.held"
        :key="h.id"
        class="card flex items-center gap-3 p-3 transition"
        :class="merging && picked.includes(h.id) && 'border-primary bg-primary-soft'"
      >
        <button
          v-if="merging && !onScreen(h.id)"
          class="grid size-6 shrink-0 place-items-center rounded-md border-2"
          :class="
            picked.includes(h.id) ? 'border-primary bg-primary text-primary-ink' : 'border-line'
          "
          role="checkbox"
          :aria-checked="picked.includes(h.id)"
          :aria-label="title(h)"
          @click="togglePick(h.id)"
        >
          <Check v-if="picked.includes(h.id)" class="size-4" />
        </button>
        <component
          :is="merging ? 'button' : 'div'"
          class="min-w-0 flex-1 text-left"
          @click="merging && !onScreen(h.id) && togglePick(h.id)"
        >
          <p class="font-semibold">
            {{ title(h) }}
            <span v-if="onScreen(h.id)" class="badge ml-1 bg-primary-soft text-primary">{{
              t('held.onScreen')
            }}</span>
          </p>
          <p class="truncate text-xs text-ink-muted">
            {{ fmtTime(h.heldAt) }} ·
            {{ t('common.items', { n: h.lines.reduce((s, l) => s + l.qty, 0) }) }} ·
            {{ h.lines.map((l) => l.name).join(', ') }}
          </p>
        </component>
        <span class="font-bold">{{
          settings.money(cart.billTotals(h.lines, h.discount).total)
        }}</span>
        <template v-if="!merging && !onScreen(h.id)">
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
        </template>
      </li>
    </ul>
    <p v-else class="py-10 text-center text-sm text-ink-muted">
      {{ t('held.empty') }}
    </p>

    <template v-if="canMerge" #footer>
      <template v-if="merging">
        <button class="btn btn-soft" @click="merging = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary flex-1" :disabled="!enough || busy" @click="merge">
          <Merge class="size-4" />
          {{ t('held.mergeN', { n: picked.length + (cart.isEmpty ? 0 : 1) }) }}
        </button>
      </template>
      <button v-else class="btn btn-outline flex-1" @click="merging = true">
        <Merge class="size-4" /> {{ t('held.merge') }}
      </button>
    </template>
  </BaseModal>
</template>
