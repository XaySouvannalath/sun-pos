<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Pencil, Trash2, Download, Upload, Crown } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useCatalogStore } from '@/stores/catalog'
import { useOrdersStore } from '@/stores/orders'
import { useShiftStore } from '@/stores/shift'
import { useToastStore } from '@/stores/toast'
import { clearAllStorage, readStorage, writeStorage } from '@/composables/persisted'
import type { Role, Staff } from '@/types'

const settings = useSettingsStore()
const auth = useAuthStore()
const catalog = useCatalogStore()
const orders = useOrdersStore()
const shift = useShiftStore()
const toast = useToastStore()

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
  settings.s.currency = c.code
  settings.s.locale = c.locale
  settings.s.decimals = c.decimals
}

// Staff
const staffOpen = ref(false)
const staffForm = ref<{ id?: string; name: string; pin: string; role: Role }>({
  name: '',
  pin: '',
  role: 'cashier',
})
const staffError = ref('')

function editStaff(u: Staff | null) {
  staffForm.value = u ? { ...u } : { name: '', pin: '', role: 'cashier' }
  staffError.value = ''
  staffOpen.value = true
}

function saveStaff() {
  if (!staffForm.value.name.trim()) return (staffError.value = 'Name is required')
  const err = auth.saveStaff({ ...staffForm.value, name: staffForm.value.name.trim() })
  if (err) staffError.value = err
  else {
    staffOpen.value = false
    toast.show('Staff saved', 'success')
  }
}

function removeStaff() {
  if (!staffForm.value.id) return
  const err = auth.removeStaff(staffForm.value.id)
  if (err) staffError.value = err
  else staffOpen.value = false
}

// Data
const confirm = ref<null | 'sales' | 'demo' | 'factory'>(null)
const KEYS = [
  'settings',
  'staff',
  'categories',
  'products',
  'stock-moves',
  'customers',
  'orders',
  'shifts',
  'held',
]

function exportBackup() {
  const data = Object.fromEntries(KEYS.map((k) => [k, readStorage(k)]))
  const blob = new Blob(
    [JSON.stringify({ app: 'sun-pos', version: 1, at: Date.now(), data }, null, 2)],
    { type: 'application/json' },
  )
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `sun-pos-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function importBackup(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const json = JSON.parse(await file.text())
    if (json.app !== 'sun-pos' || !json.data) throw new Error('Not a Sun POS backup')
    for (const k of KEYS)
      if (json.data[k] !== undefined && json.data[k] !== null) writeStorage(k, json.data[k])
    location.reload()
  } catch (err) {
    toast.show(err instanceof Error ? err.message : 'Import failed', 'error')
  }
}

function runConfirm() {
  if (confirm.value === 'sales') {
    orders.clearAll()
    shift.reset()
    catalog.stockMoves = []
    toast.show('Sales history cleared', 'success')
  } else if (confirm.value === 'demo') {
    orders.loadDemo()
    toast.show('Demo sales loaded', 'success')
  } else if (confirm.value === 'factory') {
    clearAllStorage()
    sessionStorage.clear()
    location.href = '/'
    return
  }
  confirm.value = null
}

const confirmText = {
  sales: {
    title: 'Clear all sales?',
    body: 'Deletes every order, shift and stock movement. Products, customers and settings are kept.',
    action: 'Clear sales',
  },
  demo: {
    title: 'Replace sales with demo data?',
    body: 'Current orders are replaced with 14 days of sample sales.',
    action: 'Load demo sales',
  },
  factory: {
    title: 'Reset everything?',
    body: 'All data on this device is erased and the app starts fresh with the sample menu.',
    action: 'Reset everything',
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
          ><input id="s-name" v-model="settings.s.storeName" class="input" />
        </div>
        <div>
          <label class="label" for="s-addr">Address</label
          ><input id="s-addr" v-model="settings.s.address" class="input" />
        </div>
        <div>
          <label class="label" for="s-phone">Phone</label
          ><input id="s-phone" v-model="settings.s.phone" class="input" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="s-foot">Receipt footer</label
          ><input id="s-foot" v-model="settings.s.receiptFooter" class="input" />
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
            :value="settings.s.currency"
            class="input"
            @change="setCurrency(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="c in currencies" :key="c.code" :value="c.code">{{ c.label }}</option>
          </select>
          <p class="mt-1 text-xs text-ink-muted">
            Preview: {{ settings.money(12345.5) }} · Changing currency does not convert existing
            prices.
          </p>
        </div>
        <div>
          <label class="label" for="s-taxl">Tax name</label
          ><input id="s-taxl" v-model="settings.s.taxLabel" class="input" />
        </div>
        <div>
          <label class="label" for="s-tax">Tax rate (%)</label
          ><input
            id="s-tax"
            v-model.number="settings.s.taxRate"
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
            v-model.number="settings.s.serviceRate"
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
          <span class="label">Theme</span>
          <div class="segmented">
            <button
              v-for="t in ['light', 'dark', 'system'] as const"
              :key="t"
              class="capitalize"
              :aria-pressed="settings.s.theme === t"
              @click="settings.s.theme = t"
            >
              {{ t }}
            </button>
          </div>
        </div>
        <div>
          <label class="label" for="s-top">Top sellers period (days)</label>
          <input
            id="s-top"
            v-model.number="settings.s.topSellerDays"
            type="number"
            min="1"
            class="input"
          />
        </div>
        <div>
          <label class="label" for="s-pts">Loyalty points per 1 {{ settings.s.currency }}</label>
          <input
            id="s-pts"
            v-model.number="settings.s.pointsPerUnit"
            type="number"
            min="0"
            step="any"
            class="input"
          />
        </div>
      </div>
    </section>

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
        Data is stored in this browser. Export a backup regularly, or to move to another device.
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline" @click="exportBackup">
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
        <button class="btn btn-danger btn-sm" @click="confirm = 'factory'">Reset everything</button>
      </div>
    </section>

    <BaseModal v-model="staffOpen" :title="staffForm.id ? 'Edit staff' : 'New staff'" size="sm">
      <div class="space-y-3">
        <div>
          <label class="label" for="st-name">Name</label
          ><input id="st-name" v-model="staffForm.name" class="input" />
        </div>
        <div>
          <label class="label" for="st-pin">PIN (4–6 digits)</label
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
