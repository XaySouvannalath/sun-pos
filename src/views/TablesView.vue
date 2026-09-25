<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  ArrowRightLeft,
  Merge,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  Users,
  X,
  LayoutGrid,
  BellRing,
} from 'lucide-vue-next'
import { t } from '@/i18n'
import BaseModal from '@/components/ui/BaseModal.vue'
import FloorCanvas, { type TableState } from '@/components/tables/FloorCanvas.vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useCartStore } from '@/stores/cart'
import { useFloorStore } from '@/stores/floor'
import { useKitchenStore } from '@/stores/kitchen'
import { useSettingsStore } from '@/stores/settings'
import { useToastStore } from '@/stores/toast'
import { clone, computeTotals } from '@/utils/pos'
import type { DiningTable, FloorPlan, HeldOrder, TableShape } from '@/types'

const auth = useAuthStore()
const cart = useCartStore()
const floor = useFloorStore()
const kitchen = useKitchenStore()
const settings = useSettingsStore()
const toast = useToastStore()
const router = useRouter()

const areaId = ref('')
watch(
  () => floor.plan.areas,
  (areas) => {
    if (!areas.some((a) => a.id === areaId.value)) areaId.value = areas[0]?.id ?? ''
  },
  { immediate: true },
)

// Bills and "ready" bells come from other tills too, so keep them fresh.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
let stopTickets: (() => void) | undefined
onMounted(() => {
  void Promise.all([floor.load(), cart.loadHeld()])
  stopTickets = kitchen.watch()
  timer = setInterval(() => {
    now.value = Date.now()
    if (!editing.value) void cart.loadHeld().catch(() => null)
  }, 10000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  stopTickets?.()
})

// ---------------------------------------------------------------------------
// Using the floor: open tables, move and merge bills
// ---------------------------------------------------------------------------

const billTotal = (h: HeldOrder) => computeTotals(h.lines, h.discount, settings.s).total

/** Move or merge: the bill being moved, and what kind of table to pick. */
const picking = ref<{ bill: HeldOrder; mode: 'move' | 'merge' } | null>(null)

const states = computed(() => {
  const out: Record<string, TableState> = {}
  for (const tb of floor.plan.tables) {
    const bill = cart.heldForTable(tb.id)
    const here = cart.state.tableId === tb.id && !cart.isEmpty
    const state: TableState = bill
      ? {
          kind: here && cart.state.heldId === bill.id ? 'here' : 'busy',
          total: settings.money(billTotal(bill)),
          minutes: Math.max(0, Math.floor((now.value - bill.heldAt) / 60000)),
        }
      : { kind: here ? 'here' : 'free' }
    state.ready = kitchen.readyTables.has(tb.id)
    state.movable = !!bill && !picking.value
    if (picking.value) {
      const p = picking.value
      state.disabled = tb.id === p.bill.tableId || (p.mode === 'move' ? !!bill || here : !bill)
    }
    out[tb.id] = state
  }
  return out
})

const areaTables = computed(() => floor.plan.tables.filter((tb) => tb.areaId === areaId.value))
const counts = computed(() => {
  const all = Object.values(states.value)
  return {
    free: all.filter((s) => s.kind === 'free').length,
    busy: all.filter((s) => s.kind !== 'free').length,
  }
})

const sheet = ref<{ table: DiningTable; bill: HeldOrder } | null>(null)

async function tap(table: DiningTable) {
  if (picking.value) return pick(table)
  const bill = cart.heldForTable(table.id)
  if (bill && cart.state.heldId !== bill.id) {
    sheet.value = { table, bill }
    return
  }
  await cart.openTable(table)
  await router.push('/')
}

async function openBill() {
  if (!sheet.value) return
  await cart.resume(sheet.value.bill.id)
  sheet.value = null
  await router.push('/')
}

/** The order open on this till is saved first, so a move or merge sees its latest items. */
async function saveOpenOrder() {
  if (cart.state.heldId && !cart.isEmpty) await cart.hold()
}

function startPick(mode: 'move' | 'merge') {
  if (!sheet.value) return
  picking.value = { bill: sheet.value.bill, mode }
  sheet.value = null
}

/** Moves a bill to a free table. The message offers Undo, in case of a wrong tap or drop. */
async function moveBill(bill: HeldOrder, target: DiningTable) {
  const from = floor.tableById.get(bill.tableId ?? '')
  try {
    await saveOpenOrder()
    await api.held.move(bill.id, target.id)
    toast.show(
      t('tables.moved', { from: bill.table, to: target.name }),
      'success',
      6000,
      from && {
        label: t('tables.undo'),
        run: async () => {
          try {
            await api.held.move(bill.id, from.id)
            toast.show(t('tables.moved', { from: target.name, to: from.name }), 'success')
          } finally {
            await cart.loadHeld()
          }
        },
      },
    )
  } finally {
    await cart.loadHeld()
  }
}

async function mergeBill(bill: HeldOrder, target: DiningTable) {
  try {
    await saveOpenOrder()
    await api.held.merge(cart.heldForTable(target.id)!.id, [bill.id])
    toast.show(t('tables.mergedInto', { from: bill.table, to: target.name }), 'success')
  } finally {
    await cart.loadHeld()
  }
}

async function pick(target: DiningTable) {
  const p = picking.value
  if (!p || states.value[target.id]?.disabled) return
  picking.value = null
  if (p.mode === 'move') await moveBill(p.bill, target)
  else await mergeBill(p.bill, target)
}

/** Drag and drop: onto a free table moves the bill; onto a table in use asks to merge. */
const confirmMerge = ref<{ bill: HeldOrder; target: DiningTable } | null>(null)
async function drop(from: DiningTable, to: DiningTable) {
  const bill = cart.heldForTable(from.id)
  if (!bill) return
  if (cart.heldForTable(to.id)) confirmMerge.value = { bill, target: to }
  else await moveBill(bill, to)
}
async function doMerge() {
  const c = confirmMerge.value
  confirmMerge.value = null
  if (c) await mergeBill(c.bill, c.target)
}

// ---------------------------------------------------------------------------
// Editing the layout (managers)
// ---------------------------------------------------------------------------

const editing = ref(false)
const draft = ref<FloorPlan>({ areas: [], tables: [] })
const selectedId = ref<string | null>(null)
const saving = ref(false)
const dirty = computed(
  () => editing.value && JSON.stringify(draft.value) !== JSON.stringify(floor.plan),
)

const draftTables = computed(() => draft.value.tables.filter((tb) => tb.areaId === areaId.value))
const selected = computed(() => draft.value.tables.find((tb) => tb.id === selectedId.value))

function startEdit() {
  draft.value = clone(floor.plan)
  selectedId.value = null
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  selectedId.value = null
}

function change(id: string, patch: Partial<DiningTable>) {
  const tb = draft.value.tables.find((x) => x.id === id)
  if (tb) Object.assign(tb, patch)
}

const newId = (prefix: string) =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Next free table name: the lowest number not used yet. */
function nextName() {
  const used = new Set(draft.value.tables.map((tb) => tb.name.toLowerCase()))
  let n = 1
  while (used.has(String(n))) n++
  return String(n)
}

/** First empty spot on the current area, scanning left to right, top to bottom. */
function freeSpot(w: number, h: number) {
  const ts = draftTables.value
  for (let y = 20; y + h <= 640; y += 20)
    for (let x = 20; x + w <= 1000; x += 20)
      if (
        !ts.some(
          (o) => x < o.x + o.w + 10 && o.x < x + w + 10 && y < o.y + o.h + 10 && o.y < y + h + 10,
        )
      )
        return { x, y }
  return { x: 20, y: 20 }
}

function addTable(shape: TableShape = 'square') {
  const size = shape === 'rect' ? { w: 240, h: 120 } : { w: 120, h: 120 }
  const tb: DiningTable = {
    id: newId('tbl-'),
    name: nextName(),
    areaId: areaId.value,
    seats: shape === 'rect' ? 6 : 4,
    shape,
    ...size,
    ...freeSpot(size.w, size.h),
  }
  draft.value.tables.push(tb)
  selectedId.value = tb.id
}

function setShape(shape: TableShape) {
  const tb = selected.value
  if (!tb) return
  tb.shape = shape
  if (shape !== 'rect') tb.w = tb.h = Math.min(Math.max(tb.w, tb.h), 600)
  else if (tb.w === tb.h) tb.w = Math.min(tb.w * 2, 1000 - tb.x)
}

const busyTable = (id: string) => !!cart.heldForTable(id)

function removeTable() {
  const tb = selected.value
  if (!tb) return
  if (busyTable(tb.id)) return toast.show(t('tables.errors.busy', { n: tb.name }), 'error')
  draft.value.tables = draft.value.tables.filter((x) => x.id !== tb.id)
  selectedId.value = null
}

// Areas
const areaEdit = ref<{ id: string; name: string } | null>(null)
function editArea(id: string | null) {
  const a = draft.value.areas.find((x) => x.id === id)
  areaEdit.value = { id: a?.id ?? '', name: a?.name ?? '' }
}
function saveArea() {
  const e = areaEdit.value
  if (!e?.name.trim()) return
  if (e.id) draft.value.areas.find((a) => a.id === e.id)!.name = e.name.trim()
  else {
    const id = newId('area-')
    draft.value.areas.push({ id, name: e.name.trim() })
    areaId.value = id
  }
  areaEdit.value = null
}
function removeArea() {
  const id = areaEdit.value?.id
  if (!id || draft.value.areas.length < 2) return
  if (draft.value.tables.some((tb) => tb.areaId === id))
    return toast.show(t('tables.errors.areaNotEmpty'), 'error')
  draft.value.areas = draft.value.areas.filter((a) => a.id !== id)
  areaId.value = draft.value.areas[0]!.id
  areaEdit.value = null
}

async function saveLayout() {
  const names = new Set<string>()
  for (const tb of draft.value.tables) {
    const n = tb.name.trim().toLowerCase()
    if (!n) return toast.show(t('tables.errors.name'), 'error')
    if (names.has(n)) return toast.show(t('tables.errors.duplicate', { n: tb.name }), 'error')
    names.add(n)
  }
  saving.value = true
  try {
    await floor.save(draft.value)
    toast.show(t('tables.layoutSaved'), 'success')
    editing.value = false
    selectedId.value = null
  } finally {
    saving.value = false
  }
}

const areas = computed(() => (editing.value ? draft.value.areas : floor.plan.areas))
const shapes: TableShape[] = ['square', 'round', 'rect']

onBeforeRouteLeave(() => !dirty.value || window.confirm(t('tables.leaveUnsaved')))
</script>

<template>
  <div class="page space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="page-title flex-1">{{ editing ? t('tables.editTitle') : t('tables.title') }}</h1>
      <template v-if="!editing">
        <span class="badge bg-surface-2 py-1 text-ink-muted">{{
          t('tables.free', { n: counts.free })
        }}</span>
        <span class="badge bg-primary-soft py-1 text-primary">{{
          t('tables.busy', { n: counts.busy })
        }}</span>
        <span v-if="kitchen.readyTables.size" class="badge bg-success-soft py-1 text-success">
          <BellRing class="size-3" /> {{ t('tables.readyN', { n: kitchen.readyTables.size }) }}
        </span>
        <button v-if="auth.isAdmin" class="btn btn-outline btn-sm" @click="startEdit">
          <Pencil class="size-4" /> {{ t('tables.editLayout') }}
        </button>
      </template>
      <template v-else>
        <button class="btn btn-soft btn-sm" @click="cancelEdit">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" :disabled="saving || !dirty" @click="saveLayout">
          {{ saving ? t('common.saving') : t('tables.saveLayout') }}
        </button>
      </template>
    </div>

    <!-- Areas -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="a in areas"
        :key="a.id"
        class="chip"
        :class="areaId === a.id && 'chip-active'"
        @click="areaId = a.id"
        @dblclick="editing && editArea(a.id)"
      >
        {{ a.name }}
        <Pencil
          v-if="editing && areaId === a.id"
          class="size-3.5"
          :aria-label="t('tables.renameArea')"
          @click.stop="editArea(a.id)"
        />
      </button>
      <button v-if="editing" class="chip border-dashed" @click="editArea(null)">
        <Plus class="size-4" /> {{ t('tables.addArea') }}
      </button>
    </div>

    <!-- Move / merge banner -->
    <div
      v-if="picking"
      class="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent"
    >
      <component :is="picking.mode === 'move' ? ArrowRightLeft : Merge" class="size-5 shrink-0" />
      <span class="flex-1">{{
        picking.mode === 'move'
          ? t('tables.pickMove', { n: picking.bill.table })
          : t('tables.pickMerge', { n: picking.bill.table })
      }}</span>
      <button class="btn btn-soft btn-sm" @click="picking = null">{{ t('common.cancel') }}</button>
    </div>

    <p v-if="!floor.plan.tables.length && !editing" class="card p-10 text-center text-ink-muted">
      <LayoutGrid class="mx-auto mb-2 size-10 opacity-40" />
      {{ auth.isAdmin ? t('tables.emptyAdmin') : t('tables.empty') }}
    </p>

    <div v-else class="grid gap-4" :class="editing && 'lg:grid-cols-[minmax(0,1fr)_18rem]'">
      <FloorCanvas v-if="!editing" :tables="areaTables" :states="states" @tap="tap" @drop="drop" />
      <FloorCanvas
        v-else
        :tables="draftTables"
        editing
        :selected-id="selectedId"
        @select="selectedId = $event"
        @change="change"
      />

      <!-- Editor panel -->
      <aside v-if="editing" class="card h-fit space-y-4 p-4">
        <p class="text-xs text-ink-muted">{{ t('tables.editHelp') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="sh in shapes"
            :key="sh"
            class="btn btn-outline btn-sm h-auto flex-col py-2"
            @click="addTable(sh)"
          >
            <span
              class="block border-2 border-current"
              :class="
                sh === 'round'
                  ? 'size-5 rounded-full'
                  : sh === 'rect'
                    ? 'h-4 w-7 rounded'
                    : 'size-5 rounded'
              "
            />
            <span class="text-[11px]">{{ t(`tables.shapes.${sh}`) }}</span>
          </button>
        </div>
        <p class="-mt-2 text-center text-[11px] text-ink-muted">{{ t('tables.addHint') }}</p>

        <div v-if="selected" class="space-y-3 border-t border-line pt-4">
          <div class="grid grid-cols-2 gap-3">
            <label>
              <span class="label">{{ t('tables.name') }}</span>
              <input v-model.trim="selected.name" class="input" maxlength="12" />
            </label>
            <label>
              <span class="label">{{ t('tables.seats') }}</span>
              <input v-model.number="selected.seats" type="number" min="1" max="50" class="input" />
            </label>
          </div>
          <div>
            <span class="label">{{ t('tables.shape') }}</span>
            <div class="segmented">
              <button
                v-for="sh in shapes"
                :key="sh"
                :aria-pressed="selected.shape === sh"
                @click="setShape(sh)"
              >
                {{ t(`tables.shapes.${sh}`) }}
              </button>
            </div>
          </div>
          <label v-if="draft.areas.length > 1" class="block">
            <span class="label">{{ t('tables.area') }}</span>
            <select v-model="selected.areaId" class="input">
              <option v-for="a in draft.areas" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </label>
          <button class="btn btn-danger btn-sm w-full" @click="removeTable">
            <Trash2 class="size-4" /> {{ t('tables.deleteTable') }}
          </button>
        </div>
        <p v-else class="border-t border-line pt-4 text-center text-sm text-ink-muted">
          {{ t('tables.selectHint') }}
        </p>
      </aside>
    </div>

    <p v-if="!editing && floor.plan.tables.length" class="text-xs text-ink-muted">
      {{ t('tables.hint') }} {{ t('tables.dragHint') }}
    </p>

    <!-- A busy table: its bill and what to do with it -->
    <BaseModal
      :model-value="!!sheet"
      :title="sheet ? t('tables.tableN', { n: sheet.table.name }) : ''"
      size="sm"
      @update:model-value="sheet = null"
    >
      <template v-if="sheet">
        <p class="mb-3 flex items-center gap-2 text-sm text-ink-muted">
          <Users class="size-4" />
          {{ t('tables.seatsN', { n: sheet.table.seats }) }} ·
          {{ t('tables.minutes', { n: states[sheet.table.id]?.minutes ?? 0 }) }}
        </p>
        <ul class="max-h-60 divide-y divide-line/70 overflow-y-auto rounded-xl border border-line">
          <li
            v-for="l in sheet.bill.lines"
            :key="l.id ?? l.key"
            class="flex gap-2 px-3 py-2 text-sm"
          >
            <span>{{ l.emoji }}</span>
            <span class="flex-1">{{ l.qty }} × {{ l.name }}</span>
            <span
              v-if="(l.sentQty ?? 0) < l.qty && cart.hasStation(l.categoryId)"
              class="badge bg-accent-soft text-accent"
              >{{ t('kitchen.notSent') }}</span
            >
          </li>
        </ul>
        <p class="mt-3 flex justify-between text-lg font-bold">
          <span>{{ t('common.total') }}</span>
          <span>{{ settings.money(billTotal(sheet.bill)) }}</span>
        </p>
      </template>
      <template #footer>
        <div class="grid w-full grid-cols-2 gap-2">
          <button class="btn btn-soft" @click="startPick('move')">
            <ArrowRightLeft class="size-4" /> {{ t('tables.move') }}
          </button>
          <button class="btn btn-soft" @click="startPick('merge')">
            <Merge class="size-4" /> {{ t('tables.merge') }}
          </button>
          <button class="btn btn-primary col-span-2" @click="openBill">
            <ReceiptText class="size-4" /> {{ t('tables.openBill') }}
          </button>
        </div>
      </template>
    </BaseModal>

    <!-- Dropped a bill on a table in use -->
    <BaseModal
      :model-value="!!confirmMerge"
      :title="
        confirmMerge
          ? t('tables.mergeTitle', { from: confirmMerge.bill.table, to: confirmMerge.target.name })
          : ''
      "
      size="sm"
      @update:model-value="confirmMerge = null"
    >
      <p class="text-sm text-ink-muted">{{ t('tables.mergeBody') }}</p>
      <template #footer>
        <button class="btn btn-soft flex-1" @click="confirmMerge = null">
          {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary flex-1" @click="doMerge">
          <Merge class="size-4" /> {{ t('tables.merge') }}
        </button>
      </template>
    </BaseModal>

    <!-- Area name -->
    <BaseModal
      :model-value="!!areaEdit"
      :title="areaEdit?.id ? t('tables.renameArea') : t('tables.addArea')"
      size="sm"
      @update:model-value="areaEdit = null"
    >
      <label v-if="areaEdit" class="block">
        <span class="label">{{ t('tables.areaName') }}</span>
        <input
          v-model="areaEdit.name"
          class="input"
          maxlength="30"
          :placeholder="t('tables.areaPlaceholder')"
          @keydown.enter="saveArea"
        />
      </label>
      <template #footer>
        <button
          v-if="areaEdit?.id && draft.areas.length > 1"
          class="btn btn-danger"
          :aria-label="t('common.delete')"
          @click="removeArea"
        >
          <Trash2 class="size-4" />
        </button>
        <button class="btn btn-soft ml-auto" @click="areaEdit = null">
          <X class="size-4" /> {{ t('common.cancel') }}
        </button>
        <button class="btn btn-primary" :disabled="!areaEdit?.name.trim()" @click="saveArea">
          {{ t('common.save') }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
