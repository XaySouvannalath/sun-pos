<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fmtDateTime as fmt, t } from '@/i18n'
import { ArrowDownToLine, ArrowUpFromLine, Lock, Wallet } from 'lucide-vue-next'
import BaseModal from '@/components/ui/BaseModal.vue'
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue'
import { useShiftStore } from '@/stores/shift'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { useApprovalStore } from '@/stores/approval'
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
/** Blind count: this cashier doesn't see what the drawer should hold. */
const blind = computed(() => !!summary.value?.blind)
const approval = useApprovalStore()
const history = ref<ShiftWithSummary[]>([])

async function loadHistory() {
  history.value = await api.shifts.history(30)
}
onMounted(() => Promise.all([shift.load(), loadHistory()]))
const difference = computed(() =>
  summary.value ? settings.round((Number(counted.value) || 0) - summary.value.expectedCash) : 0,
)

async function openShift() {
  await shift.open(Math.max(0, Number(openingFloat.value) || 0))
  toast.show(t('shift.opened'), 'success')
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
  let approvalId: string | null = ''
  if (moveType.value === 'out' && settings.s.controls.approveCashOut) {
    approvalId = await approval.ask('cashOut', {
      detail: [settings.money(amt), moveReason.value.trim()].filter(Boolean).join(' · '),
    })
    if (approvalId === null) return
  }
  await shift.moveCash(moveType.value, amt, moveReason.value.trim(), approvalId || null)
  moveOpen.value = false
  toast.show(moveType.value === 'in' ? t('shift.cashAdded') : t('shift.cashRemoved'), 'success')
}

function startClose() {
  counted.value = blind.value ? 0 : (summary.value?.expectedCash ?? 0)
  closeNote.value = ''
  closeOpen.value = true
}

async function closeShift() {
  await shift.close(Math.max(0, Number(counted.value) || 0), closeNote.value.trim())
  await loadHistory()
  closeOpen.value = false
  toast.show(blind.value ? t('shift.closedBlind') : t('shift.closed'), 'success')
}
</script>

<template>
  <div class="page space-y-6">
    <h1 class="page-title">{{ t('shift.title') }}</h1>

    <!-- No open shift -->
    <div v-if="!shift.current" class="card mx-auto max-w-md p-6 text-center">
      <Wallet class="mx-auto size-12 text-primary" />
      <h2 class="mt-3 text-lg font-semibold">{{ t('shift.noneOpen') }}</h2>
      <p class="mt-1 text-sm text-ink-muted">{{ t('shift.noneOpenHelp') }}</p>
      <div class="mt-5 text-left">
        <label class="label" for="float">{{ t('shift.openingCash') }}</label>
        <input
          id="float"
          v-model.number="openingFloat"
          type="number"
          min="0"
          class="input text-lg"
          @keydown.enter="openShift"
        />
      </div>
      <button class="btn btn-primary btn-lg mt-4 w-full" @click="openShift">
        {{ t('shift.open') }}
      </button>
    </div>

    <!-- Current shift -->
    <template v-else-if="summary">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex-1">
          <p class="text-sm text-ink-muted">
            {{ t('shift.openedAt', { time: fmt(shift.current.openedAt) }) }}
            <b class="text-ink">{{ shift.current.openedBy }}</b>
          </p>
        </div>
        <button class="btn btn-soft" @click="startMove('in')">
          <ArrowDownToLine class="size-4" /> {{ t('shift.cashIn') }}
        </button>
        <button class="btn btn-soft" @click="startMove('out')">
          <ArrowUpFromLine class="size-4" /> {{ t('shift.cashOut') }}
        </button>
        <button class="btn btn-primary" @click="startClose">
          <Lock class="size-4" /> {{ t('shift.close') }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="card p-4">
          <p class="text-xs text-ink-muted">{{ t('shift.sales') }}</p>
          <p class="text-2xl font-bold">
            <AnimatedNumber :value="summary.gross" :format="settings.money" />
          </p>
          <p class="text-xs text-ink-muted">{{ t('orders.count', { n: summary.orders }) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-ink-muted">{{ t('shift.refunds') }}</p>
          <p class="text-2xl font-bold text-danger">{{ settings.money(summary.refunded) }}</p>
          <p class="text-xs text-ink-muted">{{ t('orders.count', { n: summary.refunds }) }}</p>
        </div>
        <div class="card p-4">
          <p class="text-xs text-ink-muted">{{ t('shift.cardQr') }}</p>
          <p class="text-2xl font-bold">
            {{ settings.money(summary.byMethod.card + summary.byMethod.qr) }}
          </p>
          <p class="text-xs text-ink-muted">
            {{ settings.money(summary.byMethod.card) }} · {{ settings.money(summary.byMethod.qr) }}
          </p>
        </div>
        <div v-if="blind" class="card p-4">
          <p class="text-xs text-ink-muted">{{ t('shift.expectedInDrawer') }}</p>
          <p class="mt-1 text-sm font-medium text-ink-muted">{{ t('shift.blindHidden') }}</p>
        </div>
        <div v-else class="card border-primary/40 bg-primary-soft p-4">
          <p class="text-xs text-ink-muted">{{ t('shift.expectedInDrawer') }}</p>
          <p class="text-2xl font-bold text-primary">
            <AnimatedNumber :value="summary.expectedCash" :format="settings.money" />
          </p>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div v-if="!blind" class="card p-5">
          <h2 class="mb-3 font-semibold">{{ t('shift.breakdown') }}</h2>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-ink-muted">{{ t('shift.openingCash') }}</dt>
              <dd>{{ settings.money(shift.current.openingFloat) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">+ {{ t('shift.cashSales') }}</dt>
              <dd>{{ settings.money(summary.cashSales) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">− {{ t('shift.cashRefunds') }}</dt>
              <dd>{{ settings.money(summary.cashRefunds) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">+ {{ t('shift.cashIn') }}</dt>
              <dd>{{ settings.money(summary.cashIn) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-ink-muted">− {{ t('shift.cashOut') }}</dt>
              <dd>{{ settings.money(summary.cashOut) }}</dd>
            </div>
            <div class="flex justify-between border-t border-line pt-2 font-bold">
              <dt>{{ t('shift.expected') }}</dt>
              <dd>{{ settings.money(summary.expectedCash) }}</dd>
            </div>
          </dl>
        </div>
        <div class="card p-5">
          <h2 class="mb-3 font-semibold">{{ t('shift.movements') }}</h2>
          <ul v-if="shift.current.cashMoves.length" class="divide-y divide-line/70 text-sm">
            <li
              v-for="(m, i) in [...shift.current.cashMoves].reverse()"
              :key="i"
              class="flex items-center gap-3 py-2"
            >
              <ArrowDownToLine v-if="m.type === 'in'" class="size-4 text-success" />
              <ArrowUpFromLine v-else class="size-4 text-danger" />
              <span class="flex-1"
                >{{ m.reason || (m.type === 'in' ? t('shift.cashIn') : t('shift.cashOut')) }}
                <span class="text-xs text-ink-muted">· {{ m.by }} · {{ fmt(m.at) }}</span></span
              >
              <span class="font-semibold"
                >{{ m.type === 'out' ? '−' : '+' }}{{ settings.money(m.amount) }}</span
              >
            </li>
          </ul>
          <p v-else class="py-6 text-center text-sm text-ink-muted">
            {{ t('shift.noMovements') }}
          </p>
        </div>
      </div>
    </template>

    <!-- History -->
    <section v-if="history.length">
      <h2 class="mb-3 text-lg font-semibold">{{ t('shift.past') }}</h2>
      <div class="card overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t('shift.col.opened') }}</th>
              <th>{{ t('shift.col.closed') }}</th>
              <th class="text-right">{{ t('shift.sales') }}</th>
              <th class="text-right">{{ t('shift.expected') }}</th>
              <th class="text-right">{{ t('shift.col.counted') }}</th>
              <th class="text-right">{{ t('shift.col.difference') }}</th>
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
              <td class="text-right">
                {{ s.expectedCash === null ? '—' : settings.money(s.expectedCash) }}
              </td>
              <td class="text-right">{{ settings.money(s.countedCash ?? 0) }}</td>
              <td v-if="s.expectedCash === null" class="text-right text-ink-muted">—</td>
              <td
                v-else
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

    <BaseModal
      v-model="moveOpen"
      :title="moveType === 'in' ? t('shift.cashIn') : t('shift.cashOut')"
      size="sm"
    >
      <div class="space-y-3">
        <div>
          <label class="label" for="amt">{{ t('payment.amount') }}</label>
          <input id="amt" v-model.number="moveAmount" type="number" min="0" class="input text-lg" />
        </div>
        <div>
          <label class="label" for="why">{{ t('fields.reason') }}</label>
          <input
            id="why"
            v-model="moveReason"
            class="input"
            :placeholder="moveType === 'in' ? t('shift.inPlaceholder') : t('shift.outPlaceholder')"
            @keydown.enter="saveMove"
          />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-soft" @click="moveOpen = false">{{ t('common.cancel') }}</button>
        <button
          class="btn btn-primary flex-1"
          :disabled="!(Number(moveAmount) > 0)"
          @click="saveMove"
        >
          {{ t('common.save') }}
        </button>
      </template>
    </BaseModal>

    <BaseModal v-model="closeOpen" :title="t('shift.close')" size="sm">
      <div v-if="summary" class="space-y-4">
        <p class="text-sm text-ink-muted">
          {{ blind ? t('shift.countHelpBlind') : t('shift.countHelp') }}
        </p>
        <div v-if="!blind" class="flex justify-between rounded-xl bg-surface-2 p-3 text-sm">
          <span>{{ t('shift.expected') }}</span
          ><b>{{ settings.money(summary.expectedCash) }}</b>
        </div>
        <div>
          <label class="label" for="counted">{{ t('shift.countedCash') }}</label>
          <input
            id="counted"
            v-model.number="counted"
            type="number"
            min="0"
            class="input text-lg"
          />
        </div>
        <p
          v-if="!blind"
          class="text-sm font-semibold"
          :class="difference < 0 ? 'text-danger' : difference > 0 ? 'text-accent' : 'text-success'"
        >
          {{
            difference === 0
              ? t('shift.balances')
              : difference < 0
                ? t('shift.short', { amount: settings.money(-difference) })
                : t('shift.over', { amount: settings.money(difference) })
          }}
        </p>
        <div>
          <label class="label" for="cnote">{{ t('fields.note') }}</label>
          <input id="cnote" v-model="closeNote" class="input" :placeholder="t('common.optional')" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-soft" @click="closeOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary flex-1" @click="closeShift">
          {{ t('shift.close') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
