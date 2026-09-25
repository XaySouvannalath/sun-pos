<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeftRight, CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import { fmtDateTime, fmtDay, t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import { api } from '@/api'
import { useRatesStore } from '@/stores/rates'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { convert, currencies, localDate, ratePair, strongerThan } from '@/utils/rates'
import type { RateEntry } from '@/types'

const rates = useRatesStore()
const settings = useSettingsStore()
const toast = useToastStore()

const base = computed(() => settings.s.currency)
const dayLabel = (date: string) => fmtDay(new Date(`${date}T12:00:00`).getTime())

/**
 * One row of the form. `value` is what the manager types, in the direction they chose:
 * "1 {currency} = value {base}" when `foreignFirst`, otherwise "1 {base} = value {currency}".
 */
interface Row {
  currency: string
  value: number | null
  foreignFirst: boolean
}

const date = ref(localDate())
const rows = ref<Row[]>([])
const loading = ref(false)
const saving = ref(false)
/** Where the form's starting values came from, when not from this exact day. */
const copiedFrom = ref<string | null>(null)
const existsForDate = computed(() => rates.history.some((h) => h.date === date.value))

function toRow(e: RateEntry): Row {
  const foreignFirst = strongerThan(e.currency, base.value)
  return { currency: e.currency, value: tidy(foreignFirst ? e.rate : 1 / e.rate), foreignFirst }
}
// Removes floating-point noise from flipped rates (21849.999999 → 21850).
const tidy = (v: number) => Number(v.toPrecision(10))

const toEntry = (r: Row): RateEntry => ({
  currency: r.currency,
  rate: r.foreignFirst ? r.value! : 1 / r.value!,
})

async function loadForm() {
  loading.value = true
  try {
    // Start from the rates in effect that day, so a new day only needs the changes.
    const eff = await api.exchangeRates.get(date.value)
    rows.value = eff.rates.map(toRow)
    copiedFrom.value =
      eff.effectiveDate && eff.effectiveDate !== date.value ? eff.effectiveDate : null
    if (!rows.value.length) rows.value = defaultRows()
  } finally {
    loading.value = false
  }
}

function defaultRows(): Row[] {
  return currencies
    .filter((c) => c !== base.value)
    .slice(0, 2)
    .map((c) => ({ currency: c, value: null, foreignFirst: strongerThan(c, base.value) }))
}

const unused = computed(() =>
  currencies.filter((c) => c !== base.value && !rows.value.some((r) => r.currency === c)),
)

function addRow() {
  const c = unused.value[0]
  if (c) rows.value.push({ currency: c, value: null, foreignFirst: strongerThan(c, base.value) })
}

function flip(r: Row) {
  if (r.value) r.value = tidy(1 / r.value)
  r.foreignFirst = !r.foreignFirst
}

/** Example conversion shown under each row, e.g. "100 USD = ₭2,185,000". */
function example(r: Row) {
  if (!r.value || r.value <= 0) return ''
  const entry = toEntry(r)
  return strongerThan(r.currency, base.value)
    ? `100 ${r.currency} = ${settings.money(settings.round(100 * entry.rate))}`
    : `${settings.money(100)} = ${settings.moneyIn(convert(100, entry), r.currency)}`
}

const invalid = computed(() => rows.value.find((r) => !r.value || r.value <= 0))

async function save() {
  if (!rows.value.length) return toast.show(t('rates.errors.empty'), 'error')
  if (invalid.value)
    return toast.show(t('rates.errors.rate', { currency: invalid.value.currency }), 'error')
  saving.value = true
  try {
    await rates.save(date.value, rows.value.map(toEntry))
    toast.show(t('rates.saved', { date: dayLabel(date.value) }), 'success')
    copiedFrom.value = null
  } finally {
    saving.value = false
  }
}

const deleting = ref<string | null>(null)
async function remove() {
  const d = deleting.value
  if (!d) return
  await rates.remove(d)
  deleting.value = null
  toast.show(t('rates.deleted', { date: dayLabel(d) }), 'success')
  if (d === date.value) await loadForm()
}

function edit(d: string) {
  date.value = d
  window.scrollTo?.({ top: 0, behavior: 'smooth' })
}

watch(date, (d) => {
  if (d) void loadForm()
})
onMounted(() => Promise.all([loadForm(), rates.loadHistory(60), rates.load()]))
</script>

<template>
  <div class="page space-y-4">
    <div>
      <h1 class="page-title">{{ t('rates.title') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('rates.subtitle') }}</p>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- Set the rates for a day -->
      <section class="card space-y-4 p-4 md:p-5">
        <div class="flex flex-wrap items-end gap-3">
          <div class="flex-1">
            <h2 class="font-semibold">
              {{
                date === rates.today
                  ? t('rates.today')
                  : t('rates.forDate', { date: dayLabel(date) })
              }}
            </h2>
            <p class="text-xs text-ink-muted">
              {{ t('rates.storeCurrency', { currency: base }) }}
            </p>
          </div>
          <label class="w-44">
            <span class="label flex items-center gap-1"
              ><CalendarDays class="size-3.5" /> {{ t('rates.date') }}</span
            >
            <input v-model="date" type="date" class="input h-10" :max="rates.today" />
          </label>
        </div>

        <p
          v-if="copiedFrom"
          class="rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent"
        >
          {{ t('rates.copied', { date: dayLabel(copiedFrom) }) }}
        </p>

        <ul class="space-y-3" :class="loading && 'opacity-50'">
          <li v-for="(r, i) in rows" :key="i" class="rounded-2xl bg-surface-2 p-3">
            <div class="flex items-center gap-2">
              <span class="shrink-0 text-sm font-semibold">1</span>
              <select
                v-if="r.foreignFirst"
                v-model="r.currency"
                class="input h-10 w-20 shrink-0 px-2 sm:w-24"
                :aria-label="t('rates.currency')"
              >
                <option v-for="c in [r.currency, ...unused]" :key="c" :value="c">{{ c }}</option>
              </select>
              <span v-else class="w-12 shrink-0 text-sm font-semibold">{{ base }}</span>
              <span class="shrink-0 text-ink-muted">=</span>
              <input
                v-model.number="r.value"
                type="number"
                min="0"
                step="any"
                inputmode="decimal"
                class="input h-10 min-w-0 flex-1 [appearance:textfield] text-right font-semibold [&::-webkit-inner-spin-button]:appearance-none"
                :aria-label="t('rates.rate')"
              />
              <select
                v-if="!r.foreignFirst"
                v-model="r.currency"
                class="input h-10 w-20 shrink-0 px-2 sm:w-24"
                :aria-label="t('rates.currency')"
              >
                <option v-for="c in [r.currency, ...unused]" :key="c" :value="c">{{ c }}</option>
              </select>
              <span v-else class="w-12 shrink-0 text-sm font-semibold">{{ base }}</span>
            </div>
            <div class="mt-1 flex items-center gap-1">
              <p class="min-w-0 flex-1 pl-1 text-xs text-ink-muted">{{ example(r) }}</p>
              <button
                class="btn btn-ghost btn-sm shrink-0"
                :aria-label="t('rates.flip')"
                @click="flip(r)"
              >
                <ArrowLeftRight class="size-4" />
                <span class="hidden sm:inline">{{ t('rates.flip') }}</span>
              </button>
              <button
                class="btn btn-ghost btn-sm btn-icon shrink-0"
                :aria-label="t('common.remove')"
                @click="rows.splice(i, 1)"
              >
                <X class="size-4" />
              </button>
            </div>
          </li>
        </ul>

        <div class="flex flex-wrap gap-2">
          <button class="btn btn-outline btn-sm" :disabled="!unused.length" @click="addRow">
            <Plus class="size-4" /> {{ t('rates.addCurrency') }}
          </button>
          <span class="flex-1" />
          <button v-if="existsForDate" class="btn btn-danger btn-sm" @click="deleting = date">
            <Trash2 class="size-4" /> {{ t('common.delete') }}
          </button>
          <button class="btn btn-primary" :disabled="saving || loading" @click="save">
            {{ saving ? t('common.saving') : t('rates.save') }}
          </button>
        </div>

        <p class="text-xs text-ink-muted">
          {{ settings.s.receiptShowRates ? t('rates.receiptOn') : t('rates.receiptOff') }}
          <RouterLink to="/settings" class="font-semibold text-primary underline">{{
            t('nav.settings')
          }}</RouterLink>
        </p>
      </section>

      <!-- History -->
      <section class="card overflow-hidden">
        <h2 class="border-b border-line px-4 py-3 font-semibold">{{ t('rates.history') }}</h2>
        <ul v-if="rates.history.length" class="divide-y divide-line/70">
          <li
            v-for="h in rates.history"
            :key="h.date"
            class="flex items-start gap-3 px-4 py-3"
            :class="h.date === date && 'bg-primary-soft/50'"
          >
            <div class="min-w-0 flex-1">
              <p class="font-semibold">
                {{ dayLabel(h.date) }}
                <span
                  v-if="h.date === rates.today"
                  class="badge ml-1 bg-primary-soft text-primary"
                  >{{ t('rates.todayBadge') }}</span
                >
                <span v-if="h.base !== base" class="badge ml-1 bg-surface-2 text-ink-muted">{{
                  h.base
                }}</span>
              </p>
              <p v-for="r in h.rates" :key="r.currency" class="text-sm text-ink-muted tabular-nums">
                1 {{ ratePair(h.base, r).one }} =
                <span class="font-medium text-ink">{{
                  settings.rateNumber(ratePair(h.base, r).value)
                }}</span>
                {{ ratePair(h.base, r).other }}
              </p>
              <p class="mt-0.5 text-xs text-ink-muted">
                {{ t('rates.setBy', { name: h.updatedBy, time: fmtDateTime(h.updatedAt) }) }}
              </p>
            </div>
            <button
              class="btn btn-ghost btn-sm btn-icon"
              :aria-label="t('common.edit')"
              @click="edit(h.date)"
            >
              <Pencil class="size-4" />
            </button>
          </li>
        </ul>
        <p v-else class="p-8 text-center text-sm text-ink-muted">{{ t('rates.historyEmpty') }}</p>
      </section>
    </div>

    <BaseModal
      :model-value="!!deleting"
      :title="deleting ? t('rates.deleteTitle', { date: dayLabel(deleting) }) : ''"
      size="sm"
      @update:model-value="deleting = null"
    >
      <p class="text-sm text-ink-muted">{{ t('rates.deleteBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="deleting = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="remove">{{ t('common.delete') }}</button>
      </template>
    </BaseModal>
  </div>
</template>
