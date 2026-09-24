<script setup lang="ts">
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

const noteQuick = ['Less ice', 'No ice', 'Less sugar', 'Extra hot', 'Take away', 'No onion']

function save() {
  const l = cart.state.lines[props.index]
  if (!l) return
  l.qty = Math.max(1, Math.floor(qty.value) || 1)
  l.note = note.value.trim()
  l.discountPct = Math.min(100, Math.max(0, Number(discountPct.value) || 0))
  open.value = false
}

function remove() {
  cart.remove(props.index)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="line?.name ?? 'Item'" size="sm">
    <div v-if="line" class="space-y-4">
      <p v-if="line.options.length" class="text-sm text-ink-muted">
        {{ line.options.map((o) => o.name).join(', ') }}
      </p>
      <div>
        <span class="label">Quantity</span>
        <div class="flex items-center gap-2">
          <button
            class="btn btn-soft btn-icon"
            aria-label="Less"
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
          <button class="btn btn-soft btn-icon" aria-label="More" @click="qty++">
            <Plus class="size-4" />
          </button>
        </div>
      </div>
      <div>
        <span class="label">Item discount (%)</span>
        <div class="flex gap-2">
          <button
            v-for="d in [0, 10, 20, 50, 100]"
            :key="d"
            class="btn btn-sm flex-1"
            :class="discountPct === d ? 'btn-primary' : 'btn-soft'"
            @click="discountPct = d"
          >
            {{ d === 100 ? 'Free' : d + '%' }}
          </button>
        </div>
        <input v-model.number="discountPct" type="number" min="0" max="100" class="input mt-2" />
      </div>
      <div>
        <label class="label" for="line-note">Note for kitchen / bar</label>
        <textarea
          id="line-note"
          v-model="note"
          rows="2"
          class="input"
          placeholder="e.g. less ice"
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
      <button class="btn btn-danger" @click="remove"><Trash2 class="size-4" /> Remove</button>
      <button class="btn btn-primary flex-1" @click="save">Save</button>
    </template>
  </BaseModal>
</template>
