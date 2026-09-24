<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
    toast.show('Settings saved', 'success')
  } finally {
    saving.value = false
  }
}

const currencies = [
  { code: 'USD', locale: 'en-US', decimals: 2, label: 'US Dollar ($)' },
  { code: 'LAK', locale: 'lo-LA', decimals: 0, label: 'Lao Kip (₭)' },
  { code: 'THB', locale: 'th-TH', decimals: 2, label: 'Thai Baht (฿)' },
  { code: 'EUR', locale: 'de-DE', decimals: 2, label: 'Euro (€)' },
  { code: 'VND', locale: 'vi-VN', decimals: 0, label: 'Vietnamese Dong (₫)' },
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
  if (!staffForm.value.name.trim()) return (staffError.value = 'Name is required')
  if (!staffForm.value.id && !staffForm.value.pin) return (staffError.value = 'Enter a PIN')
  const { pin, ...rest } = staffForm.value
  const err = await auth.saveStaff({
    ...rest,
    name: rest.name.trim(),
    ...(pin ? { pin } : {}),
  })
  if (err) staffError.value = err
  else {
    staffOpen.value = false
    toast.show('Staff saved', 'success')
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
    return toast.show('That file is not valid JSON', 'error')
  }
  await api.backup.restore(json)
  await app.load()
  toast.show('Backup restored', 'success')
}

async function runConfirm() {
  const scope = confirm.value
  if (!scope) return
  await api.admin.reset(scope)
  confirm.value = null
  await Promise.all([app.load(), auth.loadStaff()])
  toast.show(confirmText[scope].done, 'success')
}

const confirmText = {
  sales: {
    title: 'Clear all sales?',
    body: 'Deletes every order, shift, held order and stock movement. Products, customers and settings are kept.',
    action: 'Clear sales',
    done: 'Sales history cleared',
  },
  demo: {
    title: 'Replace sales with demo data?',
    body: 'Current orders and shifts are replaced with 14 days of sample sales.',
    action: 'Load demo sales',
    done: 'Demo sales loaded',
  },
  all: {
    title: 'Reset everything?',
    body: 'All data is erased and the system starts again with the sample menu, staff and customers.',
    action: 'Reset everything',
    done: 'Everything was reset',
  },
}
</script>

<template>
  <div class="page max-w-4xl space-y-6">
    <h1 class="page-title">Settings</h1>

    <section class="card space-y-4 p-5">
      <h2 class="font-semibold">Store</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="label" for="s-name">Store name</label
          ><input id="s-name" v-model="form.storeName" class="input" />
        </div>
        <div>
          <label class="label" for="s-addr">Address</label
          ><input id="s-addr" v-model="form.address" class="input" />
        </div>
        <div>
          <label class="label" for="s-phone">Phone</label
          ><input id="s-phone" v-model="form.phone" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="s-foot">Receipt footer</label
          ><input id="s-foot" v-model="form.receiptFooter" class="input" />
        </div>
      </div>
    </section>

    <section class="card space-y-4 p-5">
      <h2 class="font-semibold">Money, tax & charges</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="sm:col-span-3">
          <label class="label" for="s-cur">Currency</label>
          <select
            id="s-cur"
            :value="form.currency"
            class="input"
            @change="setCurrency(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">{{ c.label }}</option>
          </select>
          <p class="mt-1 text-xs text-ink-muted">
            Preview: {{ preview }} · Changing currency does not convert existing prices.
          </p>
        </div>
        <div>
          <label class="label" for="s-taxl">Tax name</label
          ><input id="s-taxl" v-model="form.taxLabel" class="input" />
        </div>
        <div>
          <label class="label" for="s-tax">Tax rate (%)</label
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
          <label class="label" for="s-svc">Service charge (%)</label
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
      <h2 class="font-semibold">Sell screen & loyalty</h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <div>
          <span class="label">Theme (this device)</span>
          <div class="segmented">
            <button
              v-for="t in ['light', 'dark', 'system'] as const"
              :key="t"
              class="capitalize"
              :aria-pressed="settings.theme === t"
              @click="settings.theme = t"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div>
          <label class="label" for="s-top">Top sellers period (days)</label>
          <input
            id="s-top"
            v-model.number="form.topSellerDays"
            type="number"
            min="1"
            class="input"
          />
        </div>
        <div>
          <label class="label" for="s-pts">Loyalty points per 1 {{ form.currency }}</label>
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
      <p class="flex-1 text-sm">You have unsaved changes to the store settings.</p>
      <button class="btn btn-ghost btn-sm" @click="form = clone(settings.s)">Discard</button>
      <button class="btn btn-primary btn-sm" :disabled="saving" @click="saveSettings">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
    </div>

    <section class="card p-5">
      <div class="mb-3 flex items-center">
        <h2 class="flex-1 font-semibold">Staff</h2>
        <button class="btn btn-soft btn-sm" @click="editStaff(null)">
          <Plus class="size-4" /> Add staff
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
              >{{ auth.roleLabel(u.role) }}{{ u.id === auth.user?.id ? ' · you' : '' }}</span
            >
          </span>
          <button
            class="btn btn-ghost btn-sm btn-icon"
            :aria-label="`Edit ${u.name}`"
            @click="editStaff(u)"
          >
            <Pencil class="size-4" />
          </button>
        </li>
      </ul>
      <p class="mt-2 text-xs text-ink-muted">
        Managers can manage products, stock, reports, settings and refunds. Cashiers can sell,
        manage shifts and customers.
      </p>
    </section>

    <section class="card space-y-3 p-5">
      <h2 class="font-semibold">Data</h2>
      <p class="text-sm text-ink-muted">
        Export a backup regularly, or to move the data to another server. Restoring a backup
        replaces the current data.
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink to="/import" class="btn btn-primary">
          <FileSpreadsheet class="size-4" /> Import from Excel or CSV
        </RouterLink>
        <button v-if="canDownload" class="btn btn-outline" @click="exportBackup">
          <Download class="size-4" /> Export backup
        </button>
        <label class="btn btn-outline cursor-pointer"
          ><Upload class="size-4" /> Import backup<input
            type="file"
            accept="application/json"
            class="hidden"
            @change="importBackup"
        /></label>
      </div>
      <div class="flex flex-wrap gap-2 border-t border-line pt-3">
        <button class="btn btn-soft btn-sm" @click="confirm = 'demo'">Load demo sales</button>
        <button class="btn btn-danger btn-sm" @click="confirm = 'sales'">
          Clear sales history
        </button>
        <button class="btn btn-danger btn-sm" @click="confirm = 'all'">Reset everything</button>
      </div>
    </section>

    <BaseModal v-model="staffOpen" :title="staffForm.id ? 'Edit staff' : 'New staff'" size="sm">
      <div class="space-y-3">
        <div>
          <label class="label" for="st-name">Name</label
          ><input id="st-name" v-model="staffForm.name" class="input" />
        </div>
        <div>
          <label class="label" for="st-pin">{{
            staffForm.id ? 'New PIN (leave empty to keep)' : 'PIN (4–6 digits)'
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
          <span class="label">Role</span>
          <div class="segmented">
            <button
              :aria-pressed="staffForm.role === 'cashier'"
              @click="staffForm.role = 'cashier'"
            >
              Cashier
            </button>
            <button :aria-pressed="staffForm.role === 'admin'" @click="staffForm.role = 'admin'">
              Manager
            </button>
          </div>
        </div>
        <p v-if="staffError" class="text-sm text-danger">{{ staffError }}</p>
      </div>
      <template #footer>
        <button v-if="staffForm.id" class="btn btn-danger" @click="removeStaff">
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="staffOpen = false">Cancel</button>
        <button class="btn btn-primary" @click="saveStaff">Save</button>
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
        <button class="btn btn-soft flex-1" @click="confirm = null">Cancel</button>
        <button v-if="confirm" class="btn btn-danger flex-1" @click="runConfirm">
          {{ confirmText[confirm].action }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
