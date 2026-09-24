<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { languages, t } from '@/i18n'
import { Plus, Pencil, Trash2, Download, Upload, Crown, FileSpreadsheet } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { api } from '@/api'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useToastStore } from '@/stores/toast'
import { canDownload } from '@/utils/env'
import { downloadJson } from '@/utils/download'
import { clone } from '@/utils/pos'
import type { ResetScope, Role, Settings, StaffPublic } from '@/types'

const settings = useSettingsStore()
const auth = useAuthStore()
const app = useAppStore()
const toast = useToastStore()

onMounted(() => auth.loadStaff())

// Store settings are edited in a copy and saved to the server with one click.
const form = ref<Settings>(clone(settings.s))
watch(
  () => settings.s,
  (s) => (form.value = clone(s)),
)
const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(settings.s))
const saving = ref(false)

async function saveSettings() {
  saving.value = true
  try {
    await settings.save(form.value)
    toast.show(t('settings.saved'), 'success')
  } finally {
    saving.value = false
  }
}

const themes = computed(
  () =>
    [
      { id: 'light', label: t('settings.theme.light') },
      { id: 'dark', label: t('settings.theme.dark') },
      { id: 'system', label: t('settings.matchDevice') },
    ] as const,
)

const motions = computed(
  () =>
    [
      { id: 'on', label: t('settings.motion.on') },
      { id: 'off', label: t('settings.motion.off') },
      { id: 'system', label: t('settings.matchDevice') },
    ] as const,
)

const motionHelp = computed(() =>
  settings.motion === 'system'
    ? t('settings.motion.helpSystem', {
        state: settings.animate ? t('settings.motion.on') : t('settings.motion.off'),
      })
    : settings.motion === 'off'
      ? t('settings.motion.helpOff')
      : t('settings.motion.helpOn'),
)

const currencies = [
  { code: 'USD', locale: 'en-US', decimals: 2 },
  { code: 'LAK', locale: 'lo-LA', decimals: 0 },
  { code: 'THB', locale: 'th-TH', decimals: 2 },
  { code: 'EUR', locale: 'de-DE', decimals: 2 },
  { code: 'VND', locale: 'vi-VN', decimals: 0 },
]

function setCurrency(code: string) {
  const c = currencies.find((x) => x.code === code)
  if (!c) return
  form.value.currency = c.code
  form.value.locale = c.locale
  form.value.decimals = c.decimals
}

const preview = computed(() => {
  try {
    return new Intl.NumberFormat(form.value.locale, {
      style: 'currency',
      currency: form.value.currency,
      minimumFractionDigits: form.value.decimals,
      maximumFractionDigits: form.value.decimals,
    }).format(12345.5)
  } catch {
    return '—'
  }
})

// Staff
const staffOpen = ref(false)
const staffForm = ref<{ id?: string; name: string; pin: string; role: Role }>({
  name: '',
  pin: '',
  role: 'cashier',
})
const staffError = ref('')

function editStaff(u: StaffPublic | null) {
  // PINs are never sent by the server; leave the field empty to keep the current PIN.
  staffForm.value = u ? { ...u, pin: '' } : { name: '', pin: '', role: 'cashier' }
  staffError.value = ''
  staffOpen.value = true
}

async function saveStaff() {
  if (!staffForm.value.name.trim()) return (staffError.value = t('settings.staffErrors.name'))
  if (!staffForm.value.id && !staffForm.value.pin)
    return (staffError.value = t('settings.staffErrors.pin'))
  const { pin, ...rest } = staffForm.value
  const err = await auth.saveStaff({
    ...rest,
    name: rest.name.trim(),
    ...(pin ? { pin } : {}),
  })
  if (err) staffError.value = err
  else {
    staffOpen.value = false
    toast.show(t('settings.staffSaved'), 'success')
  }
}

async function removeStaff() {
  if (!staffForm.value.id) return
  const err = await auth.removeStaff(staffForm.value.id)
  if (err) staffError.value = err
  else staffOpen.value = false
}

// Data
const confirm = ref<null | ResetScope>(null)

async function exportBackup() {
  const backup = await api.backup.export()
  downloadJson(`sun-pos-backup-${new Date().toISOString().slice(0, 10)}.json`, backup)
}

async function importBackup(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let json: unknown
  try {
    json = JSON.parse(await file.text())
  } catch {
    return toast.show(t('settings.invalidJson'), 'error')
  }
  await api.backup.restore(json)
  await app.load()
  toast.show(t('settings.restored'), 'success')
}

async function runConfirm() {
  const scope = confirm.value
  if (!scope) return
  await api.admin.reset(scope)
  confirm.value = null
  await Promise.all([app.load(), auth.loadStaff()])
  toast.show(confirmText.value[scope].done, 'success')
}

const confirmText = computed(() => ({
  sales: {
    title: t('settings.reset.salesTitle'),
    body: t('settings.reset.salesBody'),
    action: t('settings.reset.salesAction'),
    done: t('settings.reset.salesDone'),
  },
  demo: {
    title: t('settings.reset.demoTitle'),
    body: t('settings.reset.demoBody'),
    action: t('settings.reset.demoAction'),
    done: t('settings.reset.demoDone'),
  },
  all: {
    title: t('settings.reset.allTitle'),
    body: t('settings.reset.allBody'),
    action: t('settings.reset.allAction'),
    done: t('settings.reset.allDone'),
  },
}))
</script>

<template>
  <div class="page max-w-4xl space-y-6">
    <h1 class="page-title">{{ t('nav.settings') }}</h1>

    <section class="card space-y-4 p-5">
      <h2 class="font-semibold">{{ t('settings.store') }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label" for="s-name">{{ t('settings.storeName') }}</label
          ><input id="s-name" v-model="form.storeName" class="input" />
        </div>
        <div>
          <label class="label" for="s-addr">{{ t('settings.address') }}</label
          ><input id="s-addr" v-model="form.address" class="input" />
        </div>
        <div>
          <label class="label" for="s-phone">{{ t('fields.phone') }}</label
          ><input id="s-phone" v-model="form.phone" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="s-foot">{{ t('settings.receiptFooter') }}</label
          ><input id="s-foot" v-model="form.receiptFooter" class="input" />
        </div>
      </div>
    </section>

    <section class="card space-y-4 p-5">
      <h2 class="font-semibold">{{ t('settings.money') }}</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="sm:col-span-3">
          <label class="label" for="s-cur">{{ t('settings.currency') }}</label>
          <select
            id="s-cur"
            :value="form.currency"
            class="input"
            @change="setCurrency(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">
              {{ t(`currency.${c.code as 'USD' | 'LAK' | 'THB' | 'EUR' | 'VND'}`) }}
            </option>
          </select>
          <p class="mt-1 text-xs text-ink-muted">
            {{ t('settings.currencyPreview', { preview }) }}
          </p>
        </div>
        <div>
          <label class="label" for="s-taxl">{{ t('settings.taxName') }}</label
          ><input id="s-taxl" v-model="form.taxLabel" class="input" />
        </div>
        <div>
          <label class="label" for="s-tax">{{ t('settings.taxRate') }}</label
          ><input
            id="s-tax"
            v-model.number="form.taxRate"
            type="number"
            min="0"
            step="any"
            class="input"
          />
        </div>
        <div>
          <label class="label" for="s-svc">{{ t('settings.serviceRate') }}</label
          ><input
            id="s-svc"
            v-model.number="form.serviceRate"
            type="number"
            min="0"
            step="any"
            class="input"
          />
        </div>
      </div>
    </section>

    <section class="card space-y-4 p-5">
      <div>
        <h2 class="font-semibold">{{ t('settings.display') }}</h2>
        <p class="mt-1 text-sm text-ink-muted">{{ t('settings.displayHelp') }}</p>
      </div>
      <div>
        <span id="lang-label" class="label">{{ t('settings.language') }}</span>
        <div class="segmented" role="group" aria-labelledby="lang-label">
          <button
            v-for="l in languages"
            :key="l.id"
            :lang="l.id"
            :aria-pressed="settings.language === l.id"
            @click="settings.language = l.id"
          >
            {{ l.name }}
          </button>
        </div>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <span id="theme-label" class="label">{{ t('settings.themeLabel') }}</span>
          <div class="segmented" role="group" aria-labelledby="theme-label">
            <button
              v-for="th in themes"
              :key="th.id"
              :aria-pressed="settings.theme === th.id"
              @click="settings.theme = th.id"
            >
              {{ th.label }}
            </button>
          </div>
        </div>
        <div>
          <span id="motion-label" class="label">{{ t('settings.animations') }}</span>
          <div class="segmented" role="group" aria-labelledby="motion-label">
            <button
              v-for="m in motions"
              :key="m.id"
              :aria-pressed="settings.motion === m.id"
              @click="settings.motion = m.id"
            >
              {{ m.label }}
            </button>
          </div>
          <p class="mt-1.5 text-xs text-ink-muted">
            {{ motionHelp }}
          </p>
        </div>
      </div>
    </section>

    <section class="card space-y-4 p-5">
      <h2 class="font-semibold">{{ t('settings.sellLoyalty') }}</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="s-top">{{ t('settings.topSellerDays') }}</label>
          <input
            id="s-top"
            v-model.number="form.topSellerDays"
            type="number"
            min="1"
            class="input"
          />
        </div>
        <div>
          <label class="label" for="s-pts">{{
            t('settings.pointsPer', { currency: form.currency })
          }}</label>
          <input
            id="s-pts"
            v-model.number="form.pointsPerUnit"
            type="number"
            min="0"
            step="any"
            class="input"
          />
        </div>
      </div>
    </section>

    <div
      v-if="dirty"
      class="card sticky bottom-20 z-10 flex items-center gap-3 border-primary/40 p-3 shadow-lg md:bottom-4"
    >
      <p class="flex-1 text-sm">{{ t('settings.unsaved') }}</p>
      <button class="btn btn-ghost btn-sm" @click="form = clone(settings.s)">
        {{ t('settings.discard') }}
      </button>
      <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveSettings">
        {{ saving ? t('common.saving') : t('settings.save') }}
      </button>
    </div>

    <section class="card p-5">
      <div class="mb-3 flex items-center">
        <h2 class="flex-1 font-semibold">{{ t('settings.staff') }}</h2>
        <button class="btn btn-soft btn-sm" @click="editStaff(null)">
          <Plus class="size-4" /> {{ t('settings.addStaff') }}
        </button>
      </div>
      <ul class="divide-y divide-line/70">
        <li v-for="u in auth.staff" :key="u.id" class="flex items-center gap-3 py-3">
          <span
            class="grid size-10 place-items-center rounded-full bg-accent-soft font-bold text-accent"
            >{{ u.name.charAt(0) }}</span
          >
          <span class="flex-1">
            <span class="flex items-center gap-1.5 font-medium"
              >{{ u.name }} <Crown v-if="u.role === 'admin'" class="size-3.5 text-accent"
            /></span>
            <span class="text-xs text-ink-muted"
              >{{ auth.roleLabel(u.role)
              }}{{ u.id === auth.user?.id ? ` · ${t('settings.you')}` : '' }}</span
            >
          </span>
          <button
            class="btn btn-ghost btn-sm btn-icon"
            :aria-label="t('products.editItem', { name: u.name })"
            @click="editStaff(u)"
          >
            <Pencil class="size-4" />
          </button>
        </li>
      </ul>
      <p class="mt-2 text-xs text-ink-muted">
        {{ t('settings.rolesHelp') }}
      </p>
    </section>

    <section class="card space-y-3 p-5">
      <h2 class="font-semibold">{{ t('settings.data') }}</h2>
      <p class="text-sm text-ink-muted">{{ t('settings.dataHelp') }}</p>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/import" class="btn btn-primary">
          <FileSpreadsheet class="size-4" /> {{ t('settings.importExcel') }}
        </RouterLink>
        <button v-if="canDownload" class="btn btn-outline" @click="exportBackup">
          <Download class="size-4" /> {{ t('settings.exportBackup') }}
        </button>
        <label class="btn btn-outline cursor-pointer"
          ><Upload class="size-4" /> {{ t('settings.importBackup')
          }}<input type="file" accept="application/json" class="hidden" @change="importBackup"
        /></label>
      </div>
      <div class="flex flex-wrap gap-2 border-t border-line pt-3">
        <button class="btn btn-soft btn-sm" @click="confirm = 'demo'">
          {{ t('settings.reset.demoAction') }}
        </button>
        <button class="btn btn-danger btn-sm" @click="confirm = 'sales'">
          {{ t('settings.reset.clearHistory') }}
        </button>
        <button class="btn btn-danger btn-sm" @click="confirm = 'all'">
          {{ t('settings.reset.allAction') }}
        </button>
      </div>
    </section>

    <BaseModal
      v-model="staffOpen"
      :title="staffForm.id ? t('settings.editStaff') : t('settings.newStaff')"
      size="sm"
    >
      <div class="space-y-3">
        <div>
          <label class="label" for="st-name">{{ t('fields.name') }}</label
          ><input id="st-name" v-model="staffForm.name" class="input" />
        </div>
        <div>
          <label class="label" for="st-pin">{{
            staffForm.id ? t('settings.newPin') : t('settings.pin')
          }}</label
          ><input
            id="st-pin"
            v-model="staffForm.pin"
            inputmode="numeric"
            maxlength="6"
            class="input font-mono tracking-widest"
          />
        </div>
        <div>
          <span class="label">{{ t('settings.role') }}</span>
          <div class="segmented">
            <button
              :aria-pressed="staffForm.role === 'cashier'"
              @click="staffForm.role = 'cashier'"
            >
              {{ t('roles.cashier') }}
            </button>
            <button :aria-pressed="staffForm.role === 'admin'" @click="staffForm.role = 'admin'">
              {{ t('roles.admin') }}
            </button>
          </div>
        </div>
        <p v-if="staffError" class="text-sm text-danger">{{ staffError }}</p>
      </div>
      <template #footer>
        <button v-if="staffForm.id" class="btn btn-danger" @click="removeStaff">
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="staffOpen = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary" @click="saveStaff">{{ t('common.save') }}</button>
      </template>
    </BaseModal>

    <BaseModal
      :model-value="!!confirm"
      :title="confirm ? confirmText[confirm].title : ''"
      size="sm"
      @update:model-value="(v) => !v && (confirm = null)"
    >
      <p v-if="confirm" class="text-sm text-ink-muted">{{ confirmText[confirm].body }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirm = null">
          {{ t('common.cancel') }}
        </button>
        <button v-if="confirm" class="btn btn-danger flex-1" @click="runConfirm">
          {{ confirmText[confirm].action }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
