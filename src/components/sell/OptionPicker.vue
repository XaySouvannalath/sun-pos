<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Minus, Plus, Check } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useSettingsStore } from '@/stores/settings'
import type { Product, SelectedOption } from '@/types'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{ product: Product | null }>()
const emit = defineEmits<{ add: [options: SelectedOption[], qty: number] }>()

const settings = useSettingsStore()
// group id -> selected choice names
const picked = ref<Record<string, string[]>>({})
const qty = ref(1)

watch(
  () => [open.value, props.product] as const,
  ([o, p]) => {
    if (!o || !p) return
    qty.value = 1
    picked.value = Object.fromEntries(
      p.options.map((g) => [g.id, g.required && g.choices[0] ? [g.choices[0].name] : []]),
    )
  },
  { immediate: true },
)

function toggle(groupId: string, name: string, multiple: boolean, required: boolean) {
  const cur = picked.value[groupId] ?? []
  if (multiple) {
    picked.value[groupId] = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name]
  } else {
    picked.value[groupId] = cur[0] === name && !required ? [] : [name]
  }
}

const selected = computed<SelectedOption[]>(() => {
  if (!props.product) return []
  return props.product.options.flatMap((g) =>
    g.choices
      .filter((c) => picked.value[g.id]?.includes(c.name))
      .map((c) => ({ group: g.name, name: c.name, price: c.price })),
  )
})

const valid = computed(
  () =>
    props.product?.options.every((g) => !g.required || (picked.value[g.id]?.length ?? 0) > 0) ??
    false,
)

const lineTotal = computed(
  () => ((props.product?.price ?? 0) + selected.value.reduce((s, o) => s + o.price, 0)) * qty.value,
)

function confirm() {
  if (!valid.value) return
  emit('add', selected.value, qty.value)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" size="md">
    <template #header>
      <span class="grid size-12 place-items-center rounded-xl bg-surface-2 text-2xl">{{
        product?.emoji
      }}</span>
      <div class="flex-1">
        <h2 class="text-lg font-semibold">{{ product?.name }}</h2>
        <p class="text-sm text-ink-muted">{{ settings.money(product?.price ?? 0) }}</p>
      </div>
    </template>

    <div v-if="product" class="space-y-5">
      <fieldset v-for="g in product.options" :key="g.id">
        <legend class="mb-2 flex items-center gap-2 text-sm font-semibold">
          {{ g.name }}
          <span v-if="g.required" class="badge bg-primary-soft text-primary">Required</span>
          <span v-else-if="g.multiple" class="text-xs font-normal text-ink-muted">Pick any</span>
          <span v-else class="text-xs font-normal text-ink-muted">Optional</span>
        </legend>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="c in g.choices"
            :key="c.name"
            class="flex h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm transition"
            :class="
              picked[g.id]?.includes(c.name)
                ? 'border-primary bg-primary-soft font-semibold text-ink'
                : 'border-line bg-surface hover:bg-surface-2'
            "
            :aria-pressed="picked[g.id]?.includes(c.name)"
            @click="toggle(g.id, c.name, g.multiple, g.required)"
          >
            <Check v-if="picked[g.id]?.includes(c.name)" class="size-4 shrink-0 text-primary" />
            <span class="flex-1 truncate">{{ c.name }}</span>
            <span v-if="c.price" class="text-xs text-ink-muted"
              >+{{ settings.money(c.price) }}</span
            >
          </button>
        </div>
      </fieldset>
    </div>

    <template #footer>
      <div class="flex items-center gap-2">
        <button class="btn btn-soft btn-icon" aria-label="Less" @click="qty = Math.max(1, qty - 1)">
          <Minus class="size-4" />
        </button>
        <span class="w-8 text-center text-lg font-bold">{{ qty }}</span>
        <button class="btn btn-soft btn-icon" aria-label="More" @click="qty++">
          <Plus class="size-4" />
        </button>
      </div>
      <button class="btn btn-primary flex-1" :disabled="!valid" @click="confirm">
        Add · {{ settings.money(lineTotal) }}
      </button>
    </template>
  </BaseModal>
</template>
