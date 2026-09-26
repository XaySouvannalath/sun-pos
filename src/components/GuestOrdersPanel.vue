<script setup lang="ts">
import { ref } from 'vue'
import { Check, QrCode, X } from 'lucide-vue-next'
import { fmtTime, t, tIn, type Language, type MessageKey } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useSelfOrdersStore } from '@/stores/selfOrders'
import { useSettingsStore } from '@/stores/settings'
import type { SelfOrder } from '@/types'

const selfOrders = useSelfOrdersStore()
const settings = useSettingsStore()

const busy = ref('')
async function accept(so: SelfOrder) {
  busy.value = so.id
  try {
    await selfOrders.accept(so)
  } finally {
    busy.value = ''
  }
}

// Turning an order down: the reason is shown on the guest's phone, in their language.
const rejecting = ref<SelfOrder | null>(null)
const reason = ref('')
const quickReasons = ['soldOut', 'closed', 'askStaff'] as const
const lang = (so: SelfOrder) => so.language as Language

async function reject() {
  const so = rejecting.value
  if (!so) return
  busy.value = so.id
  try {
    await selfOrders.reject(so, reason.value.trim())
    rejecting.value = null
  } finally {
    busy.value = ''
  }
}
function startReject(so: SelfOrder) {
  rejecting.value = so
  reason.value = ''
}
</script>

<template>
  <section
    v-if="selfOrders.pending.length"
    class="rounded-2xl border border-accent/40 bg-accent-soft/40 p-3"
    :aria-label="t('selfOrder.waiting')"
  >
    <h2 class="mb-2 flex items-center gap-2 px-1 font-semibold">
      <QrCode class="size-5 text-accent" />
      {{ t('selfOrder.waitingN', { n: selfOrders.pending.length }) }}
    </h2>
    <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <li v-for="so in selfOrders.pending" :key="so.id" class="card flex flex-col p-4">
        <div class="flex items-baseline gap-2">
          <b class="text-lg">{{ t('cart.tableN', { n: so.table }) }}</b>
          <span class="text-xs text-ink-muted">{{ fmtTime(so.createdAt) }}</span>
          <span v-if="so.guestName" class="ml-auto truncate text-sm text-ink-muted">
            {{ so.guestName }}
          </span>
        </div>
        <ul class="mt-2 flex-1 space-y-1 text-sm">
          <li v-for="(l, i) in so.lines" :key="i">
            <b>{{ l.qty }} ×</b> {{ l.emoji }} {{ l.name }}
            <span v-if="l.options.length" class="text-ink-muted">
              · {{ l.options.map((o) => o.name).join(', ') }}</span
            >
            <span v-if="l.note" class="block pl-6 text-xs text-accent">“{{ l.note }}”</span>
          </li>
        </ul>
        <p v-if="so.note" class="mt-2 rounded-lg bg-surface-2 px-2 py-1 text-xs">{{ so.note }}</p>
        <div class="mt-3 flex items-center gap-2">
          <span class="flex-1 text-sm font-semibold tabular-nums">
            {{ settings.money(so.subtotal) }}
          </span>
          <button class="btn btn-soft btn-sm" :disabled="busy === so.id" @click="startReject(so)">
            <X class="size-4" /> {{ t('selfOrder.reject') }}
          </button>
          <button class="btn btn-primary btn-sm" :disabled="busy === so.id" @click="accept(so)">
            <Check class="size-4" /> {{ t('selfOrder.accept') }}
          </button>
        </div>
      </li>
    </ul>

    <BaseModal
      :model-value="!!rejecting"
      :title="t('selfOrder.rejectTitle', { table: rejecting?.table ?? '' })"
      size="sm"
      @update:model-value="rejecting = null"
    >
      <p class="text-sm text-ink-muted">{{ t('selfOrder.rejectHelp') }}</p>
      <div v-if="rejecting" class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="r in quickReasons"
          :key="r"
          class="chip"
          @click="reason = tIn(lang(rejecting), `selfOrder.reasons.${r}` as MessageKey)"
        >
          {{ t(`selfOrder.reasons.${r}` as MessageKey) }}
        </button>
      </div>
      <input
        v-model="reason"
        class="input mt-3"
        maxlength="200"
        :placeholder="t('selfOrder.reasonPlaceholder')"
        :aria-label="t('selfOrder.reason')"
      />
      <template #footer>
        <button class="btn btn-soft flex-1" @click="rejecting = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" :disabled="!!busy" @click="reject">
          {{ t('selfOrder.reject') }}
        </button>
      </template>
    </BaseModal>
  </section>
</template>
