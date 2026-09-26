<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Clock, Download, Pencil, Trash2 } from 'lucide-vue-next'
import { fmtDateTime, fmtDuration, t } from '@/i18n'
import { api } from '@/api'
import BaseModal from '@/components/ui/BaseModal.vue'
import BranchSelect from '@/components/BranchSelect.vue'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { startOfDay } from '@/utils/pos'
import { downloadCsv } from '@/utils/download'
import { canDownload } from '@/utils/env'
import type { TimeEntry, Timesheet } from '@/types'

const auth = useAuthStore()
const settings = useSettingsStore()
const toast = useToastStore()

type Period = 'today' | 'week' | 'lastWeek' | 'month'
const period = ref<Period>('week')
const branch = ref('')
const DAY = 86400000

/** Weeks start on Monday. */
function range() {
  const today = startOfDay(Date.now())
  const monday = today - ((new Date(today).getDay() + 6) % 7) * DAY
  const b = branch.value ? { branch: branch.value } : {}
  if (period.value === 'today') return { from: today, to: today + DAY, ...b }
  if (period.value === 'week') return { from: monday, to: monday + 7 * DAY, ...b }
  if (period.value === 'lastWeek') return { from: monday - 7 * DAY, to: monday, ...b }
  const first = new Date(today)
  first.setDate(1)
  const next = new Date(first)
  next.setMonth(next.getMonth() + 1)
  return { from: first.getTime(), to: next.getTime(), ...b }
}

const sheet = ref<Timesheet | null>(null)
const staffFilter = ref('')
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    sheet.value = await api.time.entries({ ...range(), staff: staffFilter.value || undefined })
  } finally {
    loading.value = false
  }
}
void load()
watch([period, branch, staffFilter], load)

const labourPct = computed(() =>
  sheet.value && sheet.value.sales > 0
    ? Math.round((sheet.value.totalCost / sheet.value.sales) * 1000) / 10
    : null,
)
const branchName = (id?: string) => auth.branches.find((b) => b.id === id)?.name ?? ''
const now = Date.now()
const length = (e: TimeEntry) => fmtDuration((e.clockOut ?? now) - e.clockIn)

// ----- Correcting an entry ------------------------------------------------

/** `datetime-local` works in local time without a zone. */
const pad = (n: number) => String(n).padStart(2, '0')
function toInput(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromInput = (v: string) => new Date(v).getTime()

const editing = ref<TimeEntry | null>(null)
const form = ref({ clockIn: '', clockOut: '', note: '' })
const formError = ref('')

function edit(e: TimeEntry) {
  editing.value = e
  form.value = {
    clockIn: toInput(e.clockIn),
    clockOut: e.clockOut ? toInput(e.clockOut) : '',
    note: e.note,
  }
  formError.value = ''
}

async function save() {
  const e = editing.value
  if (!e) return
  const clockIn = fromInput(form.value.clockIn)
  const clockOut = form.value.clockOut ? fromInput(form.value.clockOut) : null
  if (!Number.isFinite(clockIn) || (clockOut !== null && !Number.isFinite(clockOut))) return
  if (clockOut !== null && clockOut <= clockIn) {
    formError.value = t('clock.outBeforeIn')
    return
  }
  await api.time.update(e.id, { clockIn, clockOut, note: form.value.note.trim() })
  editing.value = null
  toast.show(t('clock.saved'), 'success')
  await load()
}

const deleting = ref<TimeEntry | null>(null)
async function remove() {
  const e = deleting.value
  if (!e) return
  await api.time.remove(e.id)
  deleting.value = null
  editing.value = null
  await load()
}

function exportCsv() {
  if (!sheet.value) return
  const iso = (ts: number | null) => (ts ? new Date(ts).toISOString() : '')
  downloadCsv(`timesheet-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['staff', 'branch', 'clock_in', 'clock_out', 'hours', 'note', 'edited_by'],
    ...sheet.value.entries.map((e) => [
      e.staffName,
      branchName(e.branchId),
      iso(e.clockIn),
      iso(e.clockOut),
      Math.round((((e.clockOut ?? now) - e.clockIn) / 3600000) * 100) / 100,
      e.note,
      e.editedBy ?? '',
    ]),
  ])
}
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex flex-1 items-center gap-2">
        <Clock class="size-7 text-primary" /> {{ t('clock.timesheets') }}
      </h1>
      <BranchSelect v-model="branch" />
      <div class="segmented" role="group" :aria-label="t('activity.period')">
        <button
          v-for="p in ['today', 'week', 'lastWeek', 'month'] as const"
          :key="p"
          :aria-pressed="period === p"
          @click="period = p"
        >
          {{ t(`clock.periods.${p}`) }}
        </button>
      </div>
      <button v-if="canDownload" class="btn btn-outline" @click="exportCsv">
        <Download class="size-4" /> {{ t('orders.exportCsv') }}
      </button>
    </div>
    <p class="max-w-3xl text-sm text-ink-muted">{{ t('clock.subtitle') }}</p>

    <section v-if="sheet" class="grid gap-3 sm:grid-cols-3">
      <div class="card p-4">
        <p class="text-sm text-ink-muted">{{ t('clock.totalHours') }}</p>
        <p class="mt-1 text-2xl font-bold tabular-nums">
          {{ fmtDuration(sheet.totalHours * 3600000) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-ink-muted">{{ t('clock.labourCost') }}</p>
        <p class="mt-1 text-2xl font-bold tabular-nums">{{ settings.money(sheet.totalCost) }}</p>
      </div>
      <div class="card p-4">
        <p class="text-sm text-ink-muted">{{ t('clock.ofSales') }}</p>
        <p class="mt-1 text-2xl font-bold tabular-nums">
          {{ labourPct === null ? '—' : `${labourPct}%` }}
        </p>
        <p class="text-xs text-ink-muted">
          {{ t('clock.salesWere', { amount: settings.money(sheet.sales) }) }}
        </p>
      </div>
    </section>

    <!-- Per person -->
    <section v-if="sheet?.rows.length" class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('activity.cols.staff') }}</th>
            <th class="text-right">{{ t('clock.shifts') }}</th>
            <th class="text-right">{{ t('clock.hours') }}</th>
            <th class="text-right">{{ t('clock.pay') }}</th>
          </tr>
        </thead>
        <tbody class="tabular-nums">
          <tr v-for="r in sheet.rows" :key="r.staffId">
            <td class="font-semibold">
              <button
                class="text-left hover:underline"
                @click="staffFilter = staffFilter === r.staffId ? '' : r.staffId"
              >
                {{ r.staffName }}
              </button>
            </td>
            <td class="text-right">{{ r.shifts }}</td>
            <td class="text-right">{{ fmtDuration(r.hours * 3600000) }}</td>
            <td class="text-right">{{ settings.money(r.cost) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Entries -->
    <section class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="flex-1 text-lg font-semibold">{{ t('clock.entries') }}</h2>
        <button v-if="staffFilter" class="btn btn-soft btn-sm" @click="staffFilter = ''">
          {{ t('activity.allStaff') }}
        </button>
      </div>
      <ul v-if="sheet?.entries.length" class="card divide-y divide-line/70">
        <li v-for="e in sheet.entries" :key="e.id" class="flex items-center gap-3 px-4 py-3">
          <span
            class="size-2.5 shrink-0 rounded-full"
            :class="e.clockOut ? 'bg-line' : 'bg-success'"
            :title="e.clockOut ? '' : t('clock.workingNow')"
          />
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <b>{{ e.staffName }}</b>
              <span v-if="auth.multiBranch" class="text-ink-muted">
                · {{ branchName(e.branchId) }}</span
              >
            </p>
            <p class="text-sm text-ink-muted">
              {{ fmtDateTime(e.clockIn) }} →
              {{ e.clockOut ? fmtDateTime(e.clockOut) : t('clock.stillIn') }}
            </p>
            <p v-if="e.editedBy || e.note" class="text-xs text-ink-muted">
              <span v-if="e.editedBy">{{ t('clock.editedBy', { name: e.editedBy }) }}</span>
              <span v-if="e.editedBy && e.note"> · </span>{{ e.note }}
            </p>
          </div>
          <span class="text-sm font-semibold whitespace-nowrap tabular-nums">{{ length(e) }}</span>
          <button class="btn btn-ghost btn-icon" :aria-label="t('common.edit')" @click="edit(e)">
            <Pencil class="size-4" />
          </button>
        </li>
      </ul>
      <p v-else-if="!loading" class="card p-10 text-center text-sm text-ink-muted">
        <Clock class="mx-auto mb-2 size-8 opacity-40" />
        {{ t('clock.empty') }}
      </p>
    </section>

    <BaseModal
      :model-value="!!editing"
      :title="t('clock.editTitle', { name: editing?.staffName ?? '' })"
      size="sm"
      @update:model-value="editing = null"
    >
      <div class="space-y-3">
        <div>
          <label class="label" for="t-in">{{ t('clock.clockIn') }}</label>
          <input id="t-in" v-model="form.clockIn" type="datetime-local" class="input" />
        </div>
        <div>
          <label class="label" for="t-out">{{ t('clock.clockOut') }}</label>
          <input id="t-out" v-model="form.clockOut" type="datetime-local" class="input" />
          <p class="mt-1 text-xs text-ink-muted">{{ t('clock.clockOutHelp') }}</p>
        </div>
        <div>
          <label class="label" for="t-note">{{ t('clock.note') }}</label>
          <input
            id="t-note"
            v-model="form.note"
            class="input"
            maxlength="200"
            :placeholder="t('clock.notePlaceholder')"
          />
        </div>
        <p v-if="formError" class="text-sm text-danger">{{ formError }}</p>
        <p class="text-xs text-ink-muted">{{ t('clock.editLogged') }}</p>
      </div>
      <template #footer>
        <button
          class="btn btn-ghost text-danger"
          :aria-label="t('common.delete')"
          @click="deleting = editing"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft flex-1" @click="editing = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary flex-1" :disabled="!form.clockIn" @click="save">
          {{ t('common.save') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal
      :model-value="!!deleting"
      :title="t('clock.deleteTitle')"
      size="sm"
      top
      @update:model-value="deleting = null"
    >
      <p class="text-sm text-ink-muted">{{ t('clock.deleteBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="deleting = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="remove">{{ t('common.delete') }}</button>
      </template>
    </BaseModal>
  </div>
</template>
