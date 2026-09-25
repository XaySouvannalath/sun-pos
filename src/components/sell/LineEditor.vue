<script setup lang="ts">
import { t } from '@/i18n'
import { computed, ref, watch } from 'vue'
import { Minus, Plus, Trash2 } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCartStore } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'
import { lineTotal } from '@/utils/pos'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ index: number }>()

const cart = useCartStore()
const settings = useSettingsStore()

const line = computed(() => cart.state.lines[props.index])
const qty = ref(1)
const note = ref('')
const discountPct = ref(0)

watch(open, (o) => {
  const l = cart.state.lines[props.index]
  if (!o || !l) return
  qty.value = l.qty
  note.value = l.note
  discountPct.value = l.discountPct
})

// Quick notes are written in the staff's language, since they go to the kitchen or bar.
const noteQuick = computed(() =>
  (['lessIce', 'noIce', 'lessSugar', 'extraHot', 'takeAway', 'noOnion'] as const).map((k) =>
    t(`quickNotes.${k}`),
  ),
)

async function save() {
  const l = cart.state.lines[props.index]
  if (!l) return
  // Through the cart, so items the kitchen already has are reported as cancelled.
  if (!(await cart.setQty(props.index, Math.max(1, Math.floor(qty.value) || 1)))) return
  l.note = note.value.trim()
  const before = l.discountPct
  l.discountPct = Math.min(100, Math.max(0, Number(discountPct.value) || 0))
  // A bigger discount than the cashier may give needs a manager.
  if (l.discountPct > before && !(await cart.approveDiscount(() => (l.discountPct = before))))
    return
  open.value = false
}

async function remove() {
  if (await cart.remove(props.index)) open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="line?.name ?? t('lineEditor.item')" size="sm">
    <div v-if="line" class="space-y-4">
      <p v-if="line.options.length" class="text-sm text-ink-muted">
        {{ line.options.map((o) => o.name).join(', ') }}
      </p>
      <div>
        <span class="label">{{ t('lineEditor.quantity') }}</span>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-soft btn-icon"
            :aria-label="t('common.less')"
            @click="qty = Math.max(1, qty - 1)"
          >
            <Minus class="size-4" />
          </button>
          <input
            v-model.number="qty"
            type="number"
            min="1"
            class="input text-center text-lg font-bold"
          />
          <button class="btn btn-soft btn-icon" :aria-label="t('common.more')" @click="qty++">
            <Plus class="size-4" />
          </button>
        </div>
      </div>
      <div>
        <span class="label">{{ t('lineEditor.itemDiscount') }}</span>
        <div class="flex gap-2">
          <button
            v-for="d in [0, 10, 20, 50, 100]"
            :key="d"
            class="btn btn-sm flex-1"
            :class="discountPct === d ? 'btn-primary' : 'btn-soft'"
            @click="discountPct = d"
          >
            {{ d === 100 ? t('lineEditor.free') : d + '%' }}
          </button>
        </div>
        <input v-model.number="discountPct" type="number" min="0" max="100" class="input mt-2" />
      </div>
      <div>
        <label class="label" for="line-note">{{ t('lineEditor.noteLabel') }}</label>
        <textarea
          id="line-note"
          v-model="note"
          rows="2"
          class="input"
          :placeholder="t('lineEditor.notePlaceholder')"
        />
        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="n in noteQuick"
            :key="n"
            class="badge border border-line bg-surface-2 px-3 py-1 text-xs text-ink-muted hover:text-ink"
            @click="note = note ? `${note}, ${n}` : n"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <p class="text-right text-sm text-ink-muted">
        Line total:
        <b class="text-ink">{{
          settings.money(lineTotal({ unitPrice: line.unitPrice, qty, discountPct }))
        }}</b>
      </p>
    </div>
    <template #footer>
      <button class="btn btn-danger" @click="remove">
        <Trash2 class="size-4" /> {{ t('common.remove') }}
      </button>
      <button class="btn btn-primary flex-1" @click="save">{{ t('common.save') }}</button>
    </template>
  </BaseModal>
</template>
