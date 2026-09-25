<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ListChecks, Minus, Plus, Users } from 'lucide-vue-next'
import { t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { equalShares, useCartStore, type Selection } from '@/stores/cart'
import { useSettingsStore } from '@/stores/settings'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ items: [selection: Selection]; equal: [ways: number] }>()

const cart = useCartStore()
const settings = useSettingsStore()

const mode = ref<'items' | 'equal'>('items')
const picked = ref<Selection>({})
const ways = ref(2)

watch(open, (o) => {
  if (!o) return
  picked.value = {}
  ways.value = 2
})

const lines = computed(() => cart.state.lines.filter((l) => l.id))
const pickedCount = computed(() => Object.values(picked.value).reduce((s, n) => s + n, 0))
const pickedTotals = computed(() => cart.selectionTotals(picked.value))
// Picking everything is the same as charging the whole bill, so it isn't a split.
const pickedAll = computed(() => lines.value.every((l) => (picked.value[l.id!] ?? 0) >= l.qty))

function step(id: string, delta: number, max: number) {
  picked.value[id] = Math.min(Math.max((picked.value[id] ?? 0) + delta, 0), max)
}
function toggle(id: string, max: number) {
  picked.value[id] = (picked.value[id] ?? 0) > 0 ? 0 : max
}

const shares = computed(() => equalShares(cart.totals.total, ways.value, settings.s.decimals))
const sharesOk = computed(() => shares.value[0]! > 0)

function payItems() {
  emit('items', { ...picked.value })
  open.value = false
}
function payEqual() {
  emit('equal', ways.value)
  open.value = false
}
</script>

<template>
  <BaseModal v-model="open" :title="t('split.title')" size="md">
    <div class="segmented mb-4">
      <button :aria-pressed="mode === 'items'" @click="mode = 'items'">
        <ListChecks class="size-4" /> {{ t('split.byItems') }}
      </button>
      <button :aria-pressed="mode === 'equal'" @click="mode = 'equal'">
        <Users class="size-4" /> {{ t('split.equally') }}
      </button>
    </div>

    <template v-if="mode === 'items'">
      <p class="mb-3 text-sm text-ink-muted">{{ t('split.itemsHelp') }}</p>
      <ul class="divide-y divide-line/70 rounded-2xl border border-line">
        <li
          v-for="l in lines"
          :key="l.id"
          class="flex items-center gap-3 px-3 py-2.5"
          :class="(picked[l.id!] ?? 0) > 0 && 'bg-primary-soft/60'"
        >
          <button
            class="flex min-w-0 flex-1 items-center gap-3 text-left"
            @click="toggle(l.id!, l.qty)"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg">{{
              l.emoji
            }}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold">{{ l.name }}</span>
              <span class="block truncate text-xs text-ink-muted">
                {{ l.qty }} × {{ settings.money(l.unitPrice) }}
                <template v-if="l.options.length"
                  >· {{ l.options.map((o) => o.name).join(' · ') }}</template
                >
              </span>
            </span>
          </button>
          <div class="flex items-center gap-1 rounded-full bg-surface-2 p-0.5">
            <button
              class="grid size-8 place-items-center rounded-full hover:bg-surface disabled:opacity-40"
              :aria-label="t('cart.removeOne', { name: l.name })"
              :disabled="!(picked[l.id!] ?? 0)"
              @click="step(l.id!, -1, l.qty)"
            >
              <Minus class="size-3.5" />
            </button>
            <span class="w-12 text-center text-sm font-semibold"
              >{{ picked[l.id!] ?? 0 }}<span class="text-ink-muted">/{{ l.qty }}</span></span
            >
            <button
              class="grid size-8 place-items-center rounded-full hover:bg-surface disabled:opacity-40"
              :aria-label="t('cart.addOne', { name: l.name })"
              :disabled="(picked[l.id!] ?? 0) >= l.qty"
              @click="step(l.id!, 1, l.qty)"
            >
              <Plus class="size-3.5" />
            </button>
          </div>
        </li>
      </ul>
      <div class="mt-4 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
        <span class="text-sm text-ink-muted">{{ t('split.selected', { n: pickedCount }) }}</span>
        <span class="text-lg font-bold">{{ settings.money(pickedTotals.total) }}</span>
      </div>
      <p v-if="pickedAll && pickedCount" class="mt-2 text-xs text-ink-muted">
        {{ t('split.allPicked') }}
      </p>
    </template>

    <template v-else>
      <p class="mb-3 text-sm text-ink-muted">{{ t('split.guestsHelp') }}</p>
      <div class="flex items-center justify-center gap-4">
        <button
          class="btn btn-soft btn-icon"
          :aria-label="t('common.less')"
          :disabled="ways <= 2"
          @click="ways--"
        >
          <Minus class="size-4" />
        </button>
        <div class="w-24 text-center">
          <p class="text-4xl font-bold">{{ ways }}</p>
          <p class="text-xs text-ink-muted">{{ t('split.guests') }}</p>
        </div>
        <button
          class="btn btn-soft btn-icon"
          :aria-label="t('common.more')"
          :disabled="ways >= 20"
          @click="ways++"
        >
          <Plus class="size-4" />
        </button>
      </div>
      <div class="mt-3 flex flex-wrap justify-center gap-2">
        <button
          v-for="n in [2, 3, 4, 5, 6]"
          :key="n"
          class="chip h-9"
          :class="ways === n && 'chip-active'"
          @click="ways = n"
        >
          {{ n }}
        </button>
      </div>
      <div class="mt-4 rounded-2xl bg-surface-2 p-4">
        <p class="text-center text-2xl font-bold">
          {{ t('split.perGuest', { amount: settings.money(shares[0]!) }) }}
        </p>
        <ul class="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <li v-for="(s, i) in shares" :key="i" class="flex justify-between gap-2">
            <span class="text-ink-muted">{{ t('split.guestN', { n: i + 1 }) }}</span>
            <span class="font-semibold">{{ settings.money(s) }}</span>
          </li>
        </ul>
      </div>
      <p v-if="!sharesOk" class="mt-2 text-sm text-danger">{{ t('split.tooSmall') }}</p>
    </template>

    <template #footer>
      <button class="btn btn-soft" @click="open = false">{{ t('common.cancel') }}</button>
      <button
        v-if="mode === 'items'"
        class="btn btn-primary btn-lg flex-1"
        :disabled="!pickedCount"
        @click="payItems"
      >
        {{ t('split.charge', { amount: settings.money(pickedTotals.total) }) }}
      </button>
      <button v-else class="btn btn-primary btn-lg flex-1" :disabled="!sharesOk" @click="payEqual">
        {{ t('split.start') }}
      </button>
    </template>
  </BaseModal>
</template>
