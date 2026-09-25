<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChefHat, Clock, History, Play, Printer, RotateCcw, Undo2 } from 'lucide-vue-next'
import { fmtTime, t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useCatalogStore } from '@/stores/catalog'
import { useKitchenStore } from '@/stores/kitchen'
import { persisted } from '@/composables/persisted'
import { canPrint } from '@/utils/env'
import type { KitchenTicket, TicketStatus } from '@/types'

const kitchen = useKitchenStore()
const catalog = useCatalogStore()

// Each screen can show one station (the bar's tablet shows only drinks); remembered per device.
const station = persisted<string>('kitchen-station', () => 'all')
const stationName = (id: string) => catalog.stations.find((s) => s.id === id)?.name ?? id

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
let stop: (() => void) | undefined
onMounted(() => {
  stop = kitchen.watch()
  clock = setInterval(() => (now.value = Date.now()), 15000)
})
onBeforeUnmount(() => {
  stop?.()
  clearInterval(clock)
})

const tickets = computed(() =>
  kitchen.active.filter((tk) => station.value === 'all' || tk.stationId === station.value),
)
const count = (id: string) =>
  kitchen.active.filter((tk) => id === 'all' || tk.stationId === id).length

const minutes = (tk: KitchenTicket) => Math.max(0, Math.floor((now.value - tk.createdAt) / 60000))
/** Waiting time colour: fine, getting long (10 min), too long (20 min). */
function age(tk: KitchenTicket) {
  if (tk.status === 'ready') return 'border-success bg-success-soft'
  const m = minutes(tk)
  if (m >= 20) return 'border-danger'
  if (m >= 10) return 'border-accent'
  return 'border-line'
}
const ageText = (tk: KitchenTicket) => {
  const m = minutes(tk)
  return m >= 20 ? 'text-danger' : m >= 10 ? 'text-accent' : 'text-ink-muted'
}

const next: Record<TicketStatus, TicketStatus | null> = {
  new: 'preparing',
  preparing: 'ready',
  ready: 'done',
  done: null,
}
const actionLabel = (s: TicketStatus) =>
  s === 'new'
    ? t('kitchen.start')
    : s === 'preparing'
      ? t('kitchen.markReady')
      : t('kitchen.served')

const busy = ref<string | null>(null)
async function advance(tk: KitchenTicket) {
  const to = next[tk.status]
  if (!to || busy.value) return
  busy.value = tk.id
  try {
    await kitchen.setStatus(tk.id, to)
  } finally {
    busy.value = null
  }
}

async function back(tk: KitchenTicket) {
  const prev = { preparing: 'new', ready: 'preparing', done: 'ready', new: null }[tk.status]
  if (prev) await kitchen.setStatus(tk.id, prev as TicketStatus)
}

const recallOpen = ref(false)
async function recall(tk: KitchenTicket) {
  await kitchen.setStatus(tk.id, 'ready')
  recallOpen.value = false
}

const printing = ref<KitchenTicket | null>(null)
function print(tk: KitchenTicket) {
  printing.value = tk
  // Wait for the ticket to render into the print area.
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
}

const heading = (tk: KitchenTicket) =>
  tk.tableId || tk.table
    ? t('cart.tableN', { n: tk.table })
    : tk.label || t(`orderType.${tk.orderType}`)
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex flex-1 items-center gap-2">
        <ChefHat class="size-7 text-primary" /> {{ t('kitchen.title') }}
      </h1>
      <button class="btn btn-outline btn-sm" @click="recallOpen = true">
        <History class="size-4" /> {{ t('kitchen.recall') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button class="chip" :class="station === 'all' && 'chip-active'" @click="station = 'all'">
        {{ t('common.all') }}
        <span class="badge bg-black/10">{{ count('all') }}</span>
      </button>
      <button
        v-for="s in catalog.stations"
        :key="s.id"
        class="chip"
        :class="station === s.id && 'chip-active'"
        @click="station = s.id"
      >
        {{ s.name }}
        <span class="badge bg-black/10">{{ count(s.id) }}</span>
      </button>
    </div>

    <div
      v-if="!tickets.length"
      class="card flex flex-col items-center gap-2 p-12 text-center text-ink-muted"
    >
      <ChefHat class="size-12 opacity-30" />
      <p class="font-medium">{{ kitchen.loaded ? t('kitchen.empty') : t('common.loading') }}</p>
      <p class="text-sm">{{ t('kitchen.emptyHelp') }}</p>
    </div>

    <TransitionGroup
      v-else
      tag="div"
      name="list"
      class="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <article
        v-for="tk in tickets"
        :key="tk.id"
        class="card flex flex-col overflow-hidden border-2"
        :class="age(tk)"
      >
        <header class="flex items-start gap-2 border-b border-line/70 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-lg leading-tight font-bold">{{ heading(tk) }}</p>
            <p class="text-xs text-ink-muted">
              #{{ tk.number }} · {{ stationName(tk.stationId) }} · {{ tk.staffName }}
            </p>
          </div>
          <div class="text-right">
            <p class="flex items-center justify-end gap-1 text-sm font-bold" :class="ageText(tk)">
              <Clock class="size-3.5" /> {{ t('tables.minutes', { n: minutes(tk) }) }}
            </p>
            <span
              class="badge"
              :class="{
                'bg-surface-2 text-ink-muted': tk.status === 'new',
                'bg-accent-soft text-accent': tk.status === 'preparing',
                'bg-success text-primary-ink': tk.status === 'ready',
              }"
              >{{ t(`kitchen.status.${tk.status}`) }}</span
            >
          </div>
        </header>

        <ul class="flex-1 space-y-1 px-2 py-2">
          <li v-for="(it, i) in tk.items" :key="i">
            <button
              class="flex w-full gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
              :class="it.done && 'opacity-45'"
              :aria-pressed="it.done"
              @click="kitchen.toggleItem(tk, i)"
            >
              <span
                class="mt-0.5 grid size-5 shrink-0 place-items-center rounded border-2"
                :class="it.done ? 'border-success bg-success text-primary-ink' : 'border-line'"
              >
                <Check v-if="it.done" class="size-3.5" />
              </span>
              <span class="min-w-0 flex-1" :class="it.done && 'line-through'">
                <span
                  class="font-semibold"
                  :class="it.cancelled && 'text-danger line-through decoration-2'"
                  >{{ it.qty }} × {{ it.name }}</span
                >
                <span
                  v-if="it.cancelled"
                  class="badge ml-1 bg-danger text-primary-ink no-underline"
                  >{{ t('kitchen.cancelled') }}</span
                >
                <span v-if="it.options.length" class="block text-xs text-ink-muted">{{
                  it.options.join(' · ')
                }}</span>
                <span v-if="it.note" class="block text-xs font-semibold text-accent"
                  >“{{ it.note }}”</span
                >
              </span>
            </button>
          </li>
        </ul>
        <p v-if="tk.note" class="mx-4 mb-2 rounded-lg bg-accent-soft px-2 py-1 text-xs text-accent">
          {{ tk.note }}
        </p>

        <footer class="flex gap-2 border-t border-line/70 p-2">
          <button
            v-if="tk.status !== 'new'"
            class="btn btn-ghost btn-sm btn-icon"
            :aria-label="t('kitchen.back')"
            :title="t('kitchen.back')"
            @click="back(tk)"
          >
            <Undo2 class="size-4" />
          </button>
          <button
            v-if="canPrint"
            class="btn btn-ghost btn-sm btn-icon"
            :aria-label="t('receipt.print')"
            @click="print(tk)"
          >
            <Printer class="size-4" />
          </button>
          <button
            class="btn btn-sm flex-1"
            :class="tk.status === 'ready' ? 'btn-primary' : 'btn-soft'"
            :disabled="busy === tk.id"
            @click="advance(tk)"
          >
            <Play v-if="tk.status === 'new'" class="size-4" />
            <Check v-else class="size-4" />
            {{ actionLabel(tk.status) }}
          </button>
        </footer>
      </article>
    </TransitionGroup>

    <BaseModal v-model="recallOpen" :title="t('kitchen.recallTitle')" size="md">
      <ul v-if="kitchen.recent.length" class="space-y-2">
        <li v-for="tk in kitchen.recent" :key="tk.id" class="card flex items-center gap-3 p-3">
          <div class="min-w-0 flex-1">
            <p class="font-semibold">
              {{ heading(tk) }}
              <span class="text-xs font-normal text-ink-muted"
                >#{{ tk.number }} · {{ stationName(tk.stationId) }}</span
              >
            </p>
            <p class="truncate text-xs text-ink-muted">
              {{ fmtTime(tk.statusAt) }} ·
              {{ tk.items.map((i) => `${i.qty} × ${i.name}`).join(', ') }}
            </p>
          </div>
          <button class="btn btn-soft btn-sm" @click="recall(tk)">
            <RotateCcw class="size-4" /> {{ t('kitchen.recall') }}
          </button>
        </li>
      </ul>
      <p v-else class="py-8 text-center text-sm text-ink-muted">{{ t('kitchen.recallEmpty') }}</p>
    </BaseModal>

    <!-- Printed kitchen ticket (hidden on screen) -->
    <div v-if="printing" class="hidden print:block">
      <div class="print-area p-2 font-mono text-[13px] leading-snug">
        <p class="text-center text-lg font-bold">{{ heading(printing) }}</p>
        <p class="text-center">
          {{ stationName(printing.stationId) }} · #{{ printing.number }} ·
          {{ fmtTime(printing.createdAt) }}
        </p>
        <p class="text-center">{{ printing.staffName }}</p>
        <div class="my-2 border-t border-dashed border-neutral-500" />
        <div v-for="(it, i) in printing.items" :key="i" class="mb-1">
          <p class="text-[15px] font-bold">
            {{ it.cancelled ? `*** ${t('kitchen.cancelled')} *** ` : '' }}{{ it.qty }} ×
            {{ it.name }}
          </p>
          <p v-for="o in it.options" :key="o" class="pl-4">+ {{ o }}</p>
          <p v-if="it.note" class="pl-4">“{{ it.note }}”</p>
        </div>
        <p v-if="printing.note" class="mt-2">{{ printing.note }}</p>
      </div>
    </div>
  </div>
</template>
