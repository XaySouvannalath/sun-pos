<script setup lang="ts">
import { computed, ref } from 'vue'
import { BellRing, Users } from 'lucide-vue-next'
import { t } from '@/i18n'
import type { DiningTable } from '@/types'

/** How a table looks: free, busy with a bill, or open on this till. */
export interface TableState {
  kind: 'free' | 'busy' | 'here'
  /** Bill total, formatted. */
  total?: string
  /** Minutes since the bill was opened. */
  minutes?: number
  /** Food or drinks are ready to serve. */
  ready?: boolean
  /** In move/merge mode: this table can't be chosen. */
  disabled?: boolean
  /** The table has a bill that can be dragged to another table. */
  movable?: boolean
}

const props = defineProps<{
  tables: DiningTable[]
  editing?: boolean
  selectedId?: string | null
  states?: Record<string, TableState>
}>()
const emit = defineEmits<{
  tap: [table: DiningTable]
  select: [id: string | null]
  change: [id: string, patch: Partial<DiningTable>]
  /** A bill was dragged from one table and dropped on another. */
  drop: [from: DiningTable, to: DiningTable]
}>()

/** Plan size in plan units; tables are placed on a 10-unit grid. */
const PLAN = { w: 1000, h: 640 }
const GRID = 10
const snap = (v: number) => Math.round(v / GRID) * GRID
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

const board = ref<HTMLElement | null>(null)

// Dragging (move or resize) in edit mode, with the mouse, a finger or a pen.
interface Drag {
  id: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  orig: DiningTable
  unit: number
  moved: boolean
}
let drag: Drag | null = null

// Carrying a bill to another table (outside edit mode): drag a table in use onto another table.
interface Carry {
  from: DiningTable
  startX: number
  startY: number
  active: boolean
}
let carry: Carry | null = null
const carrying = ref<{ id: string; x: number; y: number; overId: string | null } | null>(null)
let skipClick = false

function tableAt(clientX: number, clientY: number, except: string) {
  const r = board.value!.getBoundingClientRect()
  const px = ((clientX - r.left) / r.width) * PLAN.w
  const py = ((clientY - r.top) / r.height) * PLAN.h
  return props.tables.find(
    (tb) => tb.id !== except && px >= tb.x && px <= tb.x + tb.w && py >= tb.y && py <= tb.y + tb.h,
  )
}

/** What dropping here would do: move to a free table, or merge into one in use. */
function dropKind(id: string | null): 'move' | 'merge' | null {
  const st = id ? props.states?.[id] : undefined
  if (!st || st.disabled) return null
  return st.kind === 'free' ? 'move' : 'merge'
}

function stopCarry() {
  carry = null
  carrying.value = null
  window.removeEventListener('keydown', escCarry)
}
function escCarry(e: KeyboardEvent) {
  if (e.key === 'Escape') stopCarry()
}

function begin(e: PointerEvent, table: DiningTable, mode: Drag['mode']) {
  if (!props.editing && mode === 'move' && props.states?.[table.id]?.movable && board.value) {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    carry = { from: table, startX: e.clientX, startY: e.clientY, active: false }
    return
  }
  if (!props.editing || !board.value) return
  e.preventDefault()
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  emit('select', table.id)
  drag = {
    id: table.id,
    mode,
    startX: e.clientX,
    startY: e.clientY,
    orig: { ...table },
    unit: PLAN.w / board.value.getBoundingClientRect().width,
    moved: false,
  }
}

function move(e: PointerEvent) {
  if (carry) {
    // A small wobble is still a tap; only a real drag carries the bill.
    if (!carry.active && Math.hypot(e.clientX - carry.startX, e.clientY - carry.startY) < 8) return
    if (!carry.active) window.addEventListener('keydown', escCarry)
    carry.active = true
    const r = board.value!.getBoundingClientRect()
    carrying.value = {
      id: carry.from.id,
      x: e.clientX - r.left,
      y: e.clientY - r.top,
      overId: tableAt(e.clientX, e.clientY, carry.from.id)?.id ?? null,
    }
    return
  }
  if (!drag) return
  const dx = (e.clientX - drag.startX) * drag.unit
  const dy = (e.clientY - drag.startY) * drag.unit
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
  const o = drag.orig
  if (drag.mode === 'move') {
    emit('change', drag.id, {
      x: clamp(snap(o.x + dx), 0, PLAN.w - o.w),
      y: clamp(snap(o.y + dy), 0, PLAN.h - o.h),
    })
  } else {
    let w = clamp(snap(o.w + dx), 40, Math.min(600, PLAN.w - o.x))
    let h = clamp(snap(o.h + dy), 40, Math.min(600, PLAN.h - o.y))
    // Square and round tables keep equal sides.
    if (o.shape !== 'rect') w = h = Math.min(Math.max(w, h), PLAN.w - o.x, PLAN.h - o.y)
    emit('change', drag.id, { w, h })
  }
}

function end() {
  drag = null
  if (!carry) return
  if (carry.active) {
    skipClick = true
    const to = carrying.value?.overId
    const target = to ? props.tables.find((tb) => tb.id === to) : undefined
    if (target && dropKind(target.id)) emit('drop', carry.from, target)
  }
  stopCarry()
}

const overKind = computed(() => dropKind(carrying.value?.overId ?? null))
const carriedName = computed(
  () => props.tables.find((tb) => tb.id === carrying.value?.id)?.name ?? '',
)
const overName = computed(
  () => props.tables.find((tb) => tb.id === carrying.value?.overId)?.name ?? '',
)

/** Arrow keys nudge the selected table (Shift for bigger steps). */
function onKey(e: KeyboardEvent, table: DiningTable) {
  if (!props.editing) return
  const step = e.shiftKey ? 50 : GRID
  const d = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }[e.key]
  if (!d) return
  e.preventDefault()
  emit('change', table.id, {
    x: clamp(table.x + d[0]!, 0, PLAN.w - table.w),
    y: clamp(table.y + d[1]!, 0, PLAN.h - table.h),
  })
}

function click(table: DiningTable) {
  if (skipClick) {
    skipClick = false
    return
  }
  if (props.editing) emit('select', table.id)
  else if (!props.states?.[table.id]?.disabled) emit('tap', table)
}

/** Tables that overlap another one are outlined while editing. */
const overlapping = computed(() => {
  const out = new Set<string>()
  if (!props.editing) return out
  const ts = props.tables
  for (let i = 0; i < ts.length; i++)
    for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i]!
      const b = ts[j]!
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        out.add(a.id)
        out.add(b.id)
      }
    }
  return out
})

const pct = (tb: DiningTable) => ({
  left: `${(tb.x / PLAN.w) * 100}%`,
  top: `${(tb.y / PLAN.h) * 100}%`,
  width: `${(tb.w / PLAN.w) * 100}%`,
  height: `${(tb.h / PLAN.h) * 100}%`,
})

function look(tb: DiningTable) {
  const st = props.states?.[tb.id]
  if (props.editing)
    return props.selectedId === tb.id
      ? 'border-primary bg-primary-soft ring-4 ring-primary/25'
      : 'border-line bg-surface'
  if (st?.disabled) return 'border-line bg-surface opacity-40'
  const c = carrying.value
  if (c?.id === tb.id) return 'border-dashed border-primary bg-primary-soft opacity-50'
  if (c?.overId === tb.id && overKind.value === 'move')
    return 'border-success bg-success-soft ring-4 ring-success/30'
  if (c?.overId === tb.id && overKind.value === 'merge')
    return 'border-accent bg-accent-soft ring-4 ring-accent/30'
  if (st?.kind === 'busy') return 'border-primary/50 bg-primary-soft text-ink'
  if (st?.kind === 'here') return 'border-dashed border-accent bg-accent-soft'
  return 'border-line bg-surface hover:border-primary'
}
</script>

<template>
  <!-- The plan keeps its shape (1000 × 640) and scales with the screen. -->
  <div class="overflow-x-auto rounded-2xl">
    <div
      ref="board"
      class="floor-grid relative aspect-[1000/640] w-full min-w-[34rem] rounded-2xl border border-line bg-surface-2"
      :class="editing && 'cursor-crosshair'"
      @pointerdown.self="editing && emit('select', null)"
      @pointermove="move"
      @pointerup="end"
      @pointercancel="end"
    >
      <button
        v-for="tb in tables"
        :key="tb.id"
        class="absolute flex flex-col items-center justify-center border-2 p-1 text-center shadow-sm transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="[
          look(tb),
          tb.shape === 'round' ? 'rounded-full' : 'rounded-2xl',
          editing ? 'cursor-grab touch-none active:cursor-grabbing' : 'lift',
          !editing && states?.[tb.id]?.movable && 'touch-none',
          overlapping.has(tb.id) && '!border-danger',
          editing && selectedId === tb.id && 'z-10',
        ]"
        :style="pct(tb)"
        :aria-label="t('tables.tableN', { n: tb.name })"
        :aria-pressed="editing ? selectedId === tb.id : undefined"
        @pointerdown="begin($event, tb, 'move')"
        @click="click(tb)"
        @keydown="onKey($event, tb)"
      >
        <span class="text-base leading-tight font-bold sm:text-lg">{{ tb.name }}</span>
        <template v-if="!editing && states?.[tb.id]?.kind === 'busy'">
          <span class="text-[11px] leading-tight font-semibold sm:text-xs">{{
            states[tb.id]!.total
          }}</span>
          <span class="text-[10px] leading-tight text-ink-muted sm:text-[11px]">{{
            t('tables.minutes', { n: states[tb.id]!.minutes ?? 0 })
          }}</span>
        </template>
        <span
          v-else-if="!editing && states?.[tb.id]?.kind === 'here'"
          class="text-[10px] leading-tight font-semibold text-accent sm:text-[11px]"
          >{{ t('tables.onThisTill') }}</span
        >
        <span v-else class="flex items-center gap-0.5 text-[10px] text-ink-muted sm:text-[11px]">
          <Users class="size-3" /> {{ tb.seats }}
        </span>
        <span
          v-if="!editing && states?.[tb.id]?.ready"
          class="absolute -top-2 -right-2 grid size-7 animate-pulse place-items-center rounded-full bg-success text-primary-ink shadow"
          :title="t('tables.ready')"
        >
          <BellRing class="size-4" />
        </span>
        <!-- Resize handle -->
        <span
          v-if="editing && selectedId === tb.id"
          class="absolute -right-2 -bottom-2 size-6 cursor-nwse-resize touch-none rounded-full border-2 border-primary bg-surface shadow"
          :aria-label="t('tables.resize')"
          @pointerdown="begin($event, tb, 'resize')"
        />
      </button>

      <!-- The bill being carried follows the pointer. -->
      <div
        v-if="carrying"
        class="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[130%] rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap shadow-lg"
        :class="
          overKind === 'move'
            ? 'bg-success text-primary-ink'
            : overKind === 'merge'
              ? 'bg-accent text-primary-ink'
              : 'bg-surface text-ink'
        "
        :style="{ left: `${carrying.x}px`, top: `${carrying.y}px` }"
        role="status"
      >
        {{
          overKind === 'move'
            ? t('tables.dropMove', { from: carriedName, to: overName })
            : overKind === 'merge'
              ? t('tables.dropMerge', { from: carriedName, to: overName })
              : t('tables.dropHint', { n: carriedName })
        }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.floor-grid {
  background-image: radial-gradient(circle, var(--c-line) 1.5px, transparent 1.5px);
  background-size: 5% calc(5% * 1000 / 640);
}
</style>
