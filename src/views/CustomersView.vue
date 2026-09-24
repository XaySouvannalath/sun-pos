<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { fmtDay, t } from '@/i18n'
import { FileSpreadsheet, Search, UserPlus, Star, Trash2, Pencil } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import CustomerForm from '@/components/CustomerForm.vue'
import { api } from '@/api'
import { useCustomersStore } from '@/stores/customers'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { Customer, Order } from '@/types'

const customers = useCustomersStore()
const settings = useSettingsStore()
const auth = useAuthStore()
const toast = useToastStore()

const q = ref('')
const editing = ref<Customer | null>(null)
const formOpen = ref(false)
const viewing = ref<Customer | null>(null)
const confirmDelete = ref(false)
const history = ref<Order[]>([])

onMounted(() => customers.load())

const list = computed(() => customers.search(q.value))
const viewOpen = computed({
  get: () => !!viewing.value,
  set: (v) => {
    if (!v) viewing.value = null
  },
})

watch(
  () => viewing.value?.id,
  async (id) => {
    history.value = []
    if (id) history.value = await api.customers.orders(id, 20)
  },
)

function openForm(c: Customer | null) {
  editing.value = c
  formOpen.value = true
}

async function save(d: Parameters<typeof customers.save>[0]) {
  const saved = await customers.save(d)
  if (viewing.value?.id === saved.id) viewing.value = saved
  formOpen.value = false
  toast.show(t('customers.saved'), 'success')
}

async function remove() {
  if (!viewing.value) return
  await customers.remove(viewing.value.id)
  confirmDelete.value = false
  viewing.value = null
  toast.show(t('customers.deleted'))
}
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">{{ t('nav.customers') }}</h1>
      <RouterLink
        v-if="auth.isAdmin"
        :to="{ path: '/import', query: { type: 'customers' } }"
        class="btn btn-outline"
      >
        <FileSpreadsheet class="size-4" /> {{ t('nav.import') }}
      </RouterLink>
      <button class="btn btn-primary" @click="openForm(null)">
        <UserPlus class="size-4" /> {{ t('customers.add') }}
      </button>
    </div>
    <div class="relative max-w-md">
      <Search class="absolute top-3 left-3 size-5 text-ink-muted" />
      <input
        v-model="q"
        class="input pl-10"
        :placeholder="t('customers.searchPlaceholder')"
        :aria-label="t('customers.searchLabel')"
      />
    </div>

    <div class="card overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('fields.name') }}</th>
            <th class="hidden sm:table-cell">{{ t('customers.contact') }}</th>
            <th class="text-right">{{ t('customers.visits') }}</th>
            <th class="text-right">{{ t('customers.spent') }}</th>
            <th class="text-right">{{ t('customers.points') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in list"
            :key="c.id"
            class="cursor-pointer hover:bg-surface-2/60"
            @click="viewing = c"
          >
            <td>
              <div class="flex items-center gap-3">
                <span
                  class="grid size-9 place-items-center rounded-full bg-accent-soft font-bold text-accent"
                  >{{ c.name.charAt(0) }}</span
                >
                <span class="font-medium">{{ c.name }}</span>
              </div>
            </td>
            <td class="hidden text-ink-muted sm:table-cell">
              {{ c.phone }}<span v-if="c.phone && c.email"> · </span>{{ c.email }}
            </td>
            <td class="text-right">{{ c.visits }}</td>
            <td class="text-right">{{ settings.money(c.totalSpent) }}</td>
            <td class="text-right font-semibold text-accent">{{ c.points }}</td>
          </tr>
          <tr v-if="!list.length">
            <td colspan="5" class="py-12 text-center text-ink-muted">
              {{ q ? t('customers.noMatch') : t('customers.empty') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <BaseModal
      v-model="formOpen"
      :title="editing ? t('customers.edit') : t('customers.new')"
      size="md"
    >
      <CustomerForm :customer="editing" @cancel="formOpen = false" @submit="save" />
    </BaseModal>

    <BaseModal v-model="viewOpen" :title="viewing?.name" size="lg">
      <div v-if="viewing" class="space-y-5">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-xl bg-surface-2 p-3">
            <p class="text-xs text-ink-muted">{{ t('customers.visits') }}</p>
            <p class="text-xl font-bold">{{ viewing.visits }}</p>
          </div>
          <div class="rounded-xl bg-surface-2 p-3">
            <p class="text-xs text-ink-muted">{{ t('customers.totalSpent') }}</p>
            <p class="text-xl font-bold">{{ settings.money(viewing.totalSpent) }}</p>
          </div>
          <div class="rounded-xl bg-accent-soft p-3">
            <p class="flex items-center gap-1 text-xs text-accent">
              <Star class="size-3" /> {{ t('customers.points') }}
            </p>
            <p class="text-xl font-bold text-accent">{{ viewing.points }}</p>
          </div>
        </div>
        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt class="label">{{ t('fields.phone') }}</dt>
            <dd>{{ viewing.phone || '—' }}</dd>
          </div>
          <div>
            <dt class="label">{{ t('fields.email') }}</dt>
            <dd>{{ viewing.email || '—' }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="label">{{ t('fields.note') }}</dt>
            <dd>{{ viewing.note || '—' }}</dd>
          </div>
        </dl>
        <div>
          <h3 class="mb-2 text-sm font-semibold">{{ t('customers.recentOrders') }}</h3>
          <ul v-if="history.length" class="divide-y divide-line/70 text-sm">
            <li v-for="o in history" :key="o.id" class="flex justify-between py-2">
              <span
                >#{{ o.number }} · {{ fmtDay(o.createdAt) }}
                <span class="text-ink-muted"
                  >· {{ t('common.items', { n: o.lines.length }) }}</span
                ></span
              >
              <span :class="o.status === 'refunded' && 'line-through text-ink-muted'">{{
                settings.money(o.total)
              }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-ink-muted">{{ t('customers.noOrders') }}</p>
        </div>
      </div>
      <template #footer>
        <button v-if="auth.isAdmin" class="btn btn-danger" @click="confirmDelete = true">
          <Trash2 class="size-4" /> {{ t('common.delete') }}
        </button>
        <button class="btn btn-primary flex-1" @click="viewing && openForm(viewing)">
          <Pencil class="size-4" /> {{ t('common.edit') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="confirmDelete" :title="t('customers.deleteTitle')" size="sm">
      <p class="text-sm text-ink-muted">{{ t('customers.deleteBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmDelete = false">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-danger flex-1" @click="remove">{{ t('common.delete') }}</button>
      </template>
    </BaseModal>
  </div>
</template>
