<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  CircleAlert,
  CircleCheck,
  Copy,
  Mail,
  MessageCircle,
  Send,
  Clock,
  Inbox,
} from 'lucide-vue-next'
import { fmtDateTime, languages, t, type Language } from '@/i18n'
import { api } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { useAuthStore } from '@/stores/auth'
import BranchSelect from '@/components/BranchSelect.vue'
import { summaryText } from '@/utils/summaryText'
import { localDate } from '@/utils/rates'
import { clone } from '@/utils/pos'
import type { DailySummary, DailySummarySettings, OutboxEntry } from '@/types'

const settings = useSettingsStore()
const toast = useToastStore()

const date = ref(localDate())
const auth = useAuthStore()
/** '' = this till's branch, a branch id, or 'all' for the whole chain. */
const branch = ref('')
/** The name shown in the message when there are several branches. */
const branchLabel = (id: string | undefined) =>
  !auth.multiBranch
    ? undefined
    : id === 'all'
      ? t('branches.all')
      : auth.branches.find((b) => b.id === (id || auth.branchId))?.name
const lang = ref<Language>(settings.s.dailySummary.language)
const summary = ref<DailySummary | null>(null)
const outbox = ref<OutboxEntry[]>([])

async function load() {
  summary.value = await api.summary.get(date.value, branch.value || undefined)
}
async function loadOutbox() {
  outbox.value = await api.summary.outbox()
}
onMounted(() => Promise.all([load(), loadOutbox()]))
watch([date, branch], ([d]) => d && load())

const text = computed(() =>
  summary.value
    ? summaryText(summary.value, {
        lang: lang.value,
        storeName: settings.s.storeName,
        branchName: branchLabel(summary.value.branchId),
        money: settings.money,
      })
    : '',
)
const warned = computed(() => summary.value?.alerts.some((a) => a.level === 'warn'))
const cashResult = computed(() => {
  const diffs = summary.value?.shifts.filter((s) => s.diff !== null).map((s) => s.diff!) ?? []
  return diffs.length ? diffs.reduce((a, b) => a + b, 0) : null
})

// Share links: open the chat app with the message ready to send.
const enc = encodeURIComponent
const shareLinks = computed(() => [
  { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(text.value)}` },
  {
    id: 'telegram',
    label: 'Telegram',
    href: `https://t.me/share/url?url=${enc(' ')}&text=${enc(text.value)}`,
  },
  { id: 'line', label: 'LINE', href: `https://line.me/R/share?text=${enc(text.value)}` },
])
const mailto = computed(
  () =>
    `mailto:${enc(settings.s.dailySummary.email)}?subject=${enc(`${settings.s.storeName} · ${t('summary.title')} ${date.value}`)}&body=${enc(text.value)}`,
)

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value)
    toast.show(t('summary.copied'), 'success')
  } catch {
    // Clipboard blocked: select the text so it can be copied by hand.
    const el = document.getElementById('summary-text')
    if (el) window.getSelection()?.selectAllChildren(el)
    toast.show(t('summary.copyManually'))
  }
}

const sending = ref(false)
async function sendNow() {
  sending.value = true
  try {
    await api.summary.send(date.value, branch.value || undefined)
    await loadOutbox()
    toast.show(t('summary.queued'), 'success')
  } finally {
    sending.value = false
  }
}

// Automatic sending settings (saved with the store settings).
const form = ref<DailySummarySettings>(clone(settings.s.dailySummary))
watch(
  () => settings.s.dailySummary,
  (v) => (form.value = clone(v)),
)
const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(settings.s.dailySummary))
const saving = ref(false)
async function saveSettings() {
  saving.value = true
  try {
    await settings.save({ dailySummary: form.value })
    toast.show(t('settings.saved'), 'success')
    await loadOutbox()
  } finally {
    saving.value = false
  }
}

const triggerLabel = (o: OutboxEntry) => t(`summary.triggers.${o.trigger}`)
const channelsLabel = (o: OutboxEntry) =>
  o.channels.length
    ? o.channels
        .map((c) => t(`summary.channels.${c as 'telegram' | 'whatsapp' | 'email'}`))
        .join(', ')
    : t('summary.noRecipients')
const openEntry = ref<string | null>(null)
const entryText = (o: OutboxEntry) =>
  summaryText(o.summary, {
    lang: form.value.language,
    storeName: settings.s.storeName,
    branchName: branchLabel(o.summary.branchId),
    money: settings.money,
  })
</script>

<template>
  <div class="page space-y-5">
    <div class="flex flex-wrap items-end gap-3">
      <div class="flex-1">
        <h1 class="page-title">{{ t('summary.pageTitle') }}</h1>
        <p class="mt-1 max-w-2xl text-sm text-ink-muted">{{ t('summary.subtitle') }}</p>
      </div>
      <label v-if="auth.multiBranch">
        <span class="label">{{ t('branches.title') }}</span>
        <BranchSelect v-model="branch" />
      </label>
      <label class="w-40">
        <span class="label">{{ t('rates.date') }}</span>
        <input v-model="date" type="date" class="input h-10" :max="localDate()" />
      </label>
      <label class="w-36">
        <span class="label">{{ t('settings.language') }}</span>
        <select v-model="lang" class="input h-10">
          <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
      </label>
    </div>

    <!-- Key figures -->
    <div v-if="summary" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('summary.sales') }}</p>
        <p class="text-2xl font-bold tabular-nums">{{ settings.money(summary.sales) }}</p>
        <p v-if="summary.lastWeek.sales" class="text-xs text-ink-muted">
          {{ t('summary.lastWeekWas', { amount: settings.money(summary.lastWeek.sales) }) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('summary.orders') }}</p>
        <p class="text-2xl font-bold tabular-nums">{{ summary.orders }}</p>
        <p class="text-xs text-ink-muted">
          {{ t('summary.avg') }} {{ settings.money(summary.avg) }}
        </p>
      </div>
      <div class="card p-4">
        <p class="text-xs text-ink-muted">{{ t('summary.cash') }}</p>
        <p
          class="text-2xl font-bold tabular-nums"
          :class="
            cashResult === null
              ? 'text-ink-muted'
              : cashResult < -0.005
                ? 'text-danger'
                : cashResult > 0.005
                  ? 'text-accent'
                  : 'text-success'
          "
        >
          {{
            cashResult === null
              ? '—'
              : Math.abs(cashResult) < 0.005
                ? t('summary.balanced')
                : settings.money(cashResult)
          }}
        </p>
        <p class="text-xs text-ink-muted">{{ t('summary.cashHint') }}</p>
      </div>
      <div
        class="card flex items-center gap-3 p-4"
        :class="warned ? 'border-danger/40 bg-danger-soft' : 'border-success/40 bg-success-soft'"
      >
        <CircleAlert v-if="warned" class="size-7 shrink-0 text-danger" />
        <CircleCheck v-else class="size-7 shrink-0 text-success" />
        <p class="text-sm font-semibold">
          {{
            warned
              ? t('summary.warnings', {
                  n: summary.alerts.filter((a) => a.level === 'warn').length,
                })
              : t('summary.allClear')
          }}
        </p>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <!-- The message -->
      <section class="card space-y-4 p-4 md:p-5">
        <h2 class="font-semibold">{{ t('summary.message') }}</h2>
        <pre
          id="summary-text"
          class="max-h-[32rem] overflow-y-auto rounded-2xl bg-surface-2 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap"
          >{{ text }}</pre>
        <div class="flex flex-wrap gap-2">
          <a
            v-for="s in shareLinks"
            :key="s.id"
            :href="s.href"
            target="_blank"
            rel="noopener"
            class="btn btn-outline btn-sm"
          >
            <MessageCircle class="size-4" /> {{ s.label }}
          </a>
          <a :href="mailto" class="btn btn-outline btn-sm">
            <Mail class="size-4" /> {{ t('summary.channels.email') }}
          </a>
          <button class="btn btn-outline btn-sm" @click="copy">
            <Copy class="size-4" /> {{ t('summary.copy') }}
          </button>
        </div>
        <p class="text-xs text-ink-muted">{{ t('summary.shareHelp') }}</p>
      </section>

      <!-- Automatic sending -->
      <section class="card h-fit space-y-4 p-4 md:p-5">
        <div class="flex items-center gap-3">
          <h2 class="flex-1 font-semibold">{{ t('summary.auto') }}</h2>
          <button
            role="switch"
            :aria-checked="form.enabled"
            :aria-label="t('summary.auto')"
            class="relative h-7 w-12 shrink-0 rounded-full transition"
            :class="form.enabled ? 'bg-primary' : 'bg-line'"
            @click="form.enabled = !form.enabled"
          >
            <span
              class="absolute top-1 left-1 size-5 rounded-full bg-surface shadow transition"
              :class="form.enabled && 'translate-x-5'"
            />
          </button>
        </div>
        <template v-if="form.enabled">
          <div class="segmented">
            <button
              :aria-pressed="form.sendAt === 'shiftClose'"
              @click="form.sendAt = 'shiftClose'"
            >
              {{ t('summary.whenShiftCloses') }}
            </button>
            <button :aria-pressed="form.sendAt === 'time'" @click="form.sendAt = 'time'">
              <Clock class="size-3.5" /> {{ t('summary.atTime') }}
            </button>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label v-if="form.sendAt === 'time'">
              <span class="label">{{ t('summary.time') }}</span>
              <input v-model="form.time" type="time" class="input" />
            </label>
            <label :class="form.sendAt !== 'time' && 'col-span-2'">
              <span class="label">{{ t('settings.language') }}</span>
              <select v-model="form.language" class="input">
                <option v-for="l in languages" :key="l.id" :value="l.id">{{ l.name }}</option>
              </select>
            </label>
          </div>
          <label class="block">
            <span class="label">{{ t('summary.channels.telegram') }}</span>
            <input v-model="form.telegram" class="input" :placeholder="t('summary.telegramHint')" />
          </label>
          <label class="block">
            <span class="label">{{ t('summary.channels.whatsapp') }}</span>
            <input v-model="form.whatsapp" class="input" placeholder="+856 20 5555 1234" />
          </label>
          <label class="block">
            <span class="label">{{ t('summary.channels.email') }}</span>
            <input v-model="form.email" class="input" placeholder="owner@example.com" />
          </label>
        </template>
        <p class="rounded-xl bg-accent-soft px-3 py-2 text-xs text-accent">
          {{ t('summary.backendNote') }}
        </p>
        <div class="flex gap-2">
          <button class="btn btn-soft btn-sm flex-1" :disabled="sending" @click="sendNow">
            <Send class="size-4" /> {{ t('summary.sendNow') }}
          </button>
          <button
            class="btn btn-primary btn-sm flex-1"
            :disabled="!dirty || saving"
            @click="saveSettings"
          >
            {{ saving ? t('common.saving') : t('common.save') }}
          </button>
        </div>
      </section>
    </div>

    <!-- Sent list -->
    <section class="space-y-3">
      <h2 class="flex items-center gap-2 text-lg font-semibold">
        <Inbox class="size-5" /> {{ t('summary.outbox') }}
      </h2>
      <ul v-if="outbox.length" class="card divide-y divide-line/70">
        <li v-for="o in outbox" :key="o.id" class="px-4 py-3">
          <button
            class="flex w-full items-center gap-3 text-left"
            :aria-expanded="openEntry === o.id"
            @click="openEntry = openEntry === o.id ? null : o.id"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold">{{ o.date }} · {{ triggerLabel(o) }}</span>
              <span class="block truncate text-xs text-ink-muted"
                >{{ fmtDateTime(o.at) }} · {{ channelsLabel(o) }}</span
              >
            </span>
            <span
              class="badge"
              :class="
                o.status === 'sent'
                  ? 'bg-success-soft text-success'
                  : o.status === 'failed'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-surface-2 text-ink-muted'
              "
              >{{ t(`summary.status.${o.status}`) }}</span
            >
          </button>
          <pre
            v-if="openEntry === o.id"
            class="mt-2 rounded-xl bg-surface-2 p-3 font-sans text-xs whitespace-pre-wrap"
            >{{ entryText(o) }}</pre>
        </li>
      </ul>
      <p v-else class="card p-8 text-center text-sm text-ink-muted">
        {{ t('summary.outboxEmpty') }}
      </p>
    </section>
  </div>
</template>
