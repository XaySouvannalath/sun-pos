<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowDownToLine, ArrowUpFromLine, Lock, Wallet } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { api } from '@/api'
import type { ShiftWithSummary } from '@/types'

const shift = useShiftStore()
const settings = useSettingsStore()
const toast = useToastStore()

const openingFloat = ref(0)
const moveOpen = ref(false)
const moveType = ref<'in' | 'out'>('in')
const moveAmount = ref(0)
const moveReason = ref('')
const closeOpen = ref(false)
const counted = ref(0)
const closeNote = ref('')

const summary = computed(() => shift.summary)
const history = ref<ShiftWithSummary[]>([])

async function loadHistory() {
  history.value = await api.shifts.history(30)
}
onMounted(() => Promise.all([shift.load(), loadHistory()]))
const difference = computed(() =>
  summary.value ? settings.round((Number(counted.value) || 0) - summary.value.expectedCash) : 0,
)

const fmt = (t: number) =>
  new Date(t).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

async function openShift() {
  await shift.open(Math.max(0, Number(openingFloat.value) || 0))
  toast.show('Shift opened', 'success')
}

function startMove(type: 'in' | 'out') {
  moveType.value = type
  moveAmount.value = 0
  moveReason.value = ''
  moveOpen.value = true
}

async function saveMove() {
  const amt = Number(moveAmount.value) || 0
  if (amt <= 0) return
  await shift.moveCash(moveType.value, amt, moveReason.value.trim())
  moveOpen.value = false
  toast.show(moveType.value === 'in' ? 'Cash added' : 'Cash removed', 'success')
}

function startClose() {
  counted.value = summary.value?.expectedCash ?? 0
  closeNote.value = ''
  closeOpen.value = true
}

async function closeShift() {
  await shift.close(Math.max(0, Number(counted.value) || 0), closeNote.value.trim())
  await loadHistory()
  closeOpen.value = false
  toast.show('Shift closed', 'success')
}
</script>

<template>
  <div class="page space-y-6">
    <h1 class="page-title">Shift & cash drawer</h1>

    <!-- No open shift -->
    <div v-if="!shift.current" class="card mx-auto max-w-md p-6 text-center">
      <Wallet class="mx-auto size-12 text-primary" />
      <h2 class="mt-3 text-lg font-semibold">No shift is open</h2>
      <p class="mt-1 text-sm text-ink-muted">
        Count the cash in the drawer and open a shift to start selling.
      </p>
      <div class="mt-5 text-left">
        <label class="label" for="float">Opening cash</label>
        <input
          id="float"
          v-model.number="openingFloat"
          type="number"
          min="0"
          class="input text-lg"
          @keydown.enter="openShift"
        />
      </div>
      <button class="btn btn-primary btn-lg mt-4 w-full" @click="openShift">Open shift</button>
    </div>

    <!-- Current shift -->
    <template v-else-if="summary">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1">
          <p class="text-sm text-ink-muted">
            Opened {{ fmt(shift.current.openedAt) }} by
            <b class="text-ink">{{ shift.current.openedBy }}</b>
          </p>
        </div>
        <button class="btn btn-soft" @click="startMove('in')">
          <ArrowDownToLine class="size-4" /> Cash in
        </button>
        <button class="btn btn-soft" @click="startMove('out')">
          <ArrowUpFromLine class="size-4" /> Cash out
        </button>
        <button class="btn btn-primary" @click="startClose">
          <Lock class="size-4" /> Close shift
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card p-4">
          <p class="text-xs text-ink-muted">Sales</p>
          <p class="text-2xl font-bold">{{ settings.money(summary.gross) }}</p>
          <p class="text-xs text-ink-muted">{{ summary.orders }} orders</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-ink-muted">Refunds</p>
          <p class="text-2xl font-bold text-danger">{{ settings.money(summary.refunded) }}</p>
          <p class="text-xs text-ink-muted">{{ summary.refunds }} orders</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-ink-muted">Card · QR</p>
          <p class="text-2xl font-bold">
            {{ settings.money(summary.byMethod.card + summary.byMethod.qr) }}
          </p>
          <p class="text-xs text-ink-muted">
            {{ settings.money(summary.byMethod.card) }} · {{ settings.money(summary.byMethod.qr) }}
          </p>
        </div>
        <div class="card border-primary/40 bg-primary-soft p-4">
          <p class="text-xs text-ink-muted">Expected cash in drawer</p>
          <p class="text-2xl font-bold text-primary">{{ settings.money(summary.expectedCash) }}</p>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card p-5">
          <h2 class="mb-3 font-semibold">Cash breakdown</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-ink-muted">Opening cash</dt>
              <dd>{{ settings.money(shift.current.openingFloat) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">+ Cash sales</dt>
              <dd>{{ settings.money(summary.cashSales) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">− Cash refunds</dt>
              <dd>{{ settings.money(summary.cashRefunds) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">+ Cash in</dt>
              <dd>{{ settings.money(summary.cashIn) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">− Cash out</dt>
              <dd>{{ settings.money(summary.cashOut) }}</dd>
            </div>
            <div class="flex justify-between border-t border-line pt-2 font-bold">
              <dt>Expected</dt>
              <dd>{{ settings.money(summary.expectedCash) }}</dd>
            </div>
          </dl>
        </div>
        <div class="card p-5">
          <h2 class="mb-3 font-semibold">Cash movements</h2>
          <ul v-if="shift.current.cashMoves.length" class="divide-y divide-line/70 text-sm">
            <li
              v-for="(m, i) in [...shift.current.cashMoves].reverse()"
              :key="i"
              class="flex items-center gap-3 py-2"
            >
              <ArrowDownToLine v-if="m.type === 'in'" class="size-4 text-success" />
              <ArrowUpFromLine v-else class="size-4 text-danger" />
              <span class="flex-1"
                >{{ m.reason || (m.type === 'in' ? 'Cash in' : 'Cash out') }}
                <span class="text-xs text-ink-muted">· {{ m.by }} · {{ fmt(m.at) }}</span></span
              >
              <span class="font-semibold"
                >{{ m.type === 'out' ? '−' : '+' }}{{ settings.money(m.amount) }}</span
              >
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-ink-muted">
            No cash added or removed yet.
          </p>
        </div>
      </div>
    </template>

    <!-- History -->
    <section v-if="history.length">
      <h2 class="mb-3 text-lg font-semibold">Past shifts</h2>
      <div class="card overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Closed</th>
              <th class="text-right">Sales</th>
              <th class="text-right">Expected</th>
              <th class="text-right">Counted</th>
              <th class="text-right">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ shift: s, summary: sum } in history" :key="s.id">
              <td class="whitespace-nowrap">
                {{ fmt(s.openedAt)
                }}<span class="block text-xs text-ink-muted">{{ s.openedBy }}</span>
              </td>
              <td class="whitespace-nowrap">
                {{ fmt(s.closedAt!)
                }}<span class="block text-xs text-ink-muted">{{ s.closedBy }}</span>
              </td>
              <td class="text-right">{{ settings.money(sum.gross) }}</td>
              <td class="text-right">{{ settings.money(s.expectedCash ?? 0) }}</td>
              <td class="text-right">{{ settings.money(s.countedCash ?? 0) }}</td>
              <td
                class="text-right font-semibold"
                :class="
                  (s.countedCash ?? 0) - (s.expectedCash ?? 0) < 0
                    ? 'text-danger'
                    : (s.countedCash ?? 0) - (s.expectedCash ?? 0) > 0
                      ? 'text-accent'
                      : 'text-success'
                "
              >
                {{ settings.money((s.countedCash ?? 0) - (s.expectedCash ?? 0)) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <BaseModal v-model="moveOpen" :title="moveType === 'in' ? 'Cash in' : 'Cash out'" size="sm">
      <div class="space-y-3">
        <div>
          <label class="label" for="amt">Amount</label>
          <input id="amt" v-model.number="moveAmount" type="number" min="0" class="input text-lg" />
        </div>
        <div>
          <label class="label" for="why">Reason</label>
          <input
            id="why"
            v-model="moveReason"
            class="input"
            :placeholder="
              moveType === 'in' ? 'e.g. Extra change' : 'e.g. Buy ice, supplier payment'
            "
            @keydown.enter="saveMove"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-soft" @click="moveOpen = false">Cancel</button>
        <button
          class="btn btn-primary flex-1"
          :disabled="!(Number(moveAmount) > 0)"
          @click="saveMove"
        >
          Save
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="closeOpen" title="Close shift" size="sm">
      <div v-if="summary" class="space-y-4">
        <p class="text-sm text-ink-muted">Count the cash in the drawer and enter the total.</p>
        <div class="flex justify-between rounded-xl bg-surface-2 p-3 text-sm">
          <span>Expected</span><b>{{ settings.money(summary.expectedCash) }}</b>
        </div>
        <div>
          <label class="label" for="counted">Counted cash</label>
          <input
            id="counted"
            v-model.number="counted"
            type="number"
            min="0"
            class="input text-lg"
          />
        </div>
        <p
          class="text-sm font-semibold"
          :class="difference < 0 ? 'text-danger' : difference > 0 ? 'text-accent' : 'text-success'"
        >
          {{
            difference === 0
              ? 'Drawer balances ✓'
              : difference < 0
                ? `Short by ${settings.money(-difference)}`
                : `Over by ${settings.money(difference)}`
          }}
        </p>
        <div>
          <label class="label" for="cnote">Note</label>
          <input id="cnote" v-model="closeNote" class="input" placeholder="Optional" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-soft" @click="closeOpen = false">Cancel</button>
        <button class="btn btn-primary flex-1" @click="closeShift">Close shift</button>
      </template>
    </BaseModal>
  </div>
</template>
