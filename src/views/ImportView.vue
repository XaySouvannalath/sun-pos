<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { t } from '@/i18n'
import { useRoute, useRouter } from 'vue-router'
import {
  Package,
  Users,
  UserCog,
  ClipboardList,
  FileUp,
  FileSpreadsheet,
  ClipboardPaste,
  Download,
  CircleCheck,
  CircleAlert,
  X,
} from 'lucide-vue-next'
import { api } from '@/api'
import { useCatalogStore } from '@/stores/catalog'
import { useCustomersStore } from '@/stores/customers'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { canDownload } from '@/utils/env'
import {
  autoMap,
  buildRows,
  downloadCsvTemplate,
  downloadExcelTemplate,
  getSpec,
  importKinds,
  parseFile,
  parseText,
  type ParsedTable,
} from '@/utils/importer'
import type { ImportKind, ImportResult, ImportRowResult } from '@/types'
import type { MessageKey } from '@/i18n'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const customers = useCustomersStore()
const auth = useAuthStore()
const toast = useToastStore()

const kinds: { kind: ImportKind; icon: typeof Package }[] = [
  { kind: 'products', icon: Package },
  { kind: 'customers', icon: Users },
  { kind: 'staff', icon: UserCog },
  { kind: 'stock', icon: ClipboardList },
]

const initial = route.query.type as ImportKind
const kind = ref<ImportKind>(importKinds.includes(initial) ? initial : 'products')
const spec = computed(() => getSpec(kind.value))

const table = ref<ParsedTable | null>(null)
const source = ref('')
const mapping = ref<Record<string, number | null>>({})
const readError = ref('')
const dragging = ref(false)
const pasteOpen = ref(false)
const pasted = ref('')

const preview = ref<ImportResult | null>(null)
const previewing = ref(false)
const importing = ref(false)
const done = ref<ImportResult | null>(null)
const filter = ref<'all' | 'error' | 'create' | 'update' | 'skip'>('all')

function reset() {
  table.value = null
  source.value = ''
  mapping.value = {}
  readError.value = ''
  preview.value = null
  done.value = null
  filter.value = 'all'
  pasted.value = ''
  pasteOpen.value = false
}

watch(kind, (k) => {
  router.replace({ query: { type: k } })
  if (table.value) mapping.value = autoMap(table.value.headers, spec.value)
  done.value = null
})

async function load(read: () => Promise<ParsedTable>, name: string) {
  readError.value = ''
  done.value = null
  try {
    const parsed = await read()
    if (!parsed.rows.length) throw new Error(t('import.errors.noRows'))
    table.value = parsed
    source.value = name
    mapping.value = autoMap(parsed.headers, spec.value)
  } catch (e) {
    readError.value = e instanceof Error ? e.message : t('import.errors.read')
  }
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void load(() => parseFile(file), file.name)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void load(() => parseFile(file), file.name)
}

function readPasted() {
  if (!pasted.value.trim()) return
  void load(() => parseText(pasted.value), t('import.pastedRows'))
  pasteOpen.value = false
}

const missing = computed(() =>
  spec.value.fields.filter((f) => f.required && mapping.value[f.key] == null),
)
const unusedColumns = computed(() => {
  if (!table.value) return []
  const used = new Set(Object.values(mapping.value))
  return table.value.headers.filter((_, i) => !used.has(i))
})
const rows = computed(() => (table.value ? buildRows(table.value, mapping.value) : []))

// Check the rows with the server (nothing is saved) whenever the file or matching changes.
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [rows, kind],
  () => {
    clearTimeout(timer)
    preview.value = null
    if (!rows.value.length || missing.value.length) return
    timer = setTimeout(async () => {
      const mine = ++seq
      previewing.value = true
      try {
        const res = await api.import.run(kind.value, { rows: rows.value, dryRun: true })
        if (mine === seq) preview.value = res
      } finally {
        if (mine === seq) previewing.value = false
      }
    }, 250)
  },
  { deep: true },
)

const toImport = computed(() => (preview.value ? preview.value.created + preview.value.updated : 0))

const shown = computed<ImportRowResult[]>(() => {
  const list = preview.value?.rows ?? []
  return filter.value === 'all' ? list : list.filter((r) => r.action === filter.value)
})

const lineOf = (index: number) => table.value?.lineNumbers[index] ?? index + 2

const actionStyle: Record<ImportRowResult['action'], { label: MessageKey; cls: string }> = {
  create: { label: 'import.result.create', cls: 'bg-success-soft text-success' },
  update: { label: 'import.result.update', cls: 'bg-primary-soft text-primary' },
  skip: { label: 'import.result.skip', cls: 'bg-surface-2 text-ink-muted' },
  error: { label: 'import.result.error', cls: 'bg-danger-soft text-danger' },
}

async function runImport() {
  if (!toImport.value || importing.value) return
  importing.value = true
  try {
    const res = await api.import.run(kind.value, { rows: rows.value, dryRun: false })
    done.value = res
    table.value = null
    preview.value = null
    // Refresh what the other screens show.
    if (kind.value === 'products') await catalog.load()
    else if (kind.value === 'customers') await customers.load()
    else if (kind.value === 'staff') await auth.loadStaff()
    else await Promise.all([catalog.refreshProducts(), catalog.loadMoves(40)])
    toast.show(t('import.imported', { rows: rowsText(res.created + res.updated) }), 'success')
  } finally {
    importing.value = false
  }
}

const rowsText = (n: number) => t('import.rows', { n })

const destination: Record<ImportKind, { to: string; label: MessageKey }> = {
  products: { to: '/products', label: 'import.view.products' },
  customers: { to: '/customers', label: 'import.view.customers' },
  staff: { to: '/settings', label: 'import.view.staff' },
  stock: { to: '/inventory', label: 'import.view.stock' },
}
</script>

<template>
  <div class="page max-w-5xl space-y-5 pb-28">
    <div>
      <h1 class="page-title">{{ t('import.title') }}</h1>
      <p class="mt-1 text-sm text-ink-muted">
        {{ t('import.subtitle') }}
      </p>
    </div>

    <!-- What to import -->
    <div
      class="grid grid-cols-2 gap-3 lg:grid-cols-4"
      role="radiogroup"
      :aria-label="t('import.what')"
    >
      <button
        v-for="k in kinds"
        :key="k.kind"
        role="radio"
        :aria-checked="kind === k.kind"
        class="card flex flex-col gap-2 p-4 text-left transition"
        :class="kind === k.kind ? 'border-primary bg-primary-soft' : 'hover:border-primary/50'"
        @click="kind = k.kind"
      >
        <component
          :is="k.icon"
          class="size-6"
          :class="kind === k.kind ? 'text-primary' : 'text-ink-muted'"
        />
        <span class="font-semibold">{{ t(`import.kinds.${k.kind}.title`) }}</span>
        <span class="text-xs leading-snug text-ink-muted">{{
          t(`import.kinds.${k.kind}.description`)
        }}</span>
      </button>
    </div>

    <!-- Finished -->
    <div v-if="done" class="card flex flex-wrap items-center gap-4 p-5">
      <CircleCheck class="size-10 text-success" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ t('import.complete') }}</p>
        <p class="text-sm text-ink-muted">
          {{
            t('import.doneSummary', {
              created: done.created,
              updated: done.updated,
              skipped: done.skipped,
            })
          }}
          <template v-if="done.failed">
            · {{ t('import.doneFailed', { rows: rowsText(done.failed) }) }}</template
          >
        </p>
      </div>
      <RouterLink :to="destination[kind].to" class="btn btn-soft">{{
        t(destination[kind].label)
      }}</RouterLink>
      <button class="btn btn-primary" @click="reset">{{ t('import.another') }}</button>
    </div>

    <template v-else>
      <!-- 1. Prepare -->
      <section class="card space-y-4 p-5">
        <div class="flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1 basis-64">
            <h2 class="font-semibold">{{ t('import.step1') }}</h2>
            <p class="mt-1 text-sm text-ink-muted">
              {{ t(`import.step1Help.${kind}`) }}
            </p>
          </div>
          <div v-if="canDownload" class="flex gap-2">
            <button class="btn btn-outline btn-sm" @click="downloadExcelTemplate(spec)">
              <Download class="size-4" /> {{ t('import.excelTemplate') }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="downloadCsvTemplate(spec)">CSV</button>
          </div>
        </div>
        <div class="overflow-x-auto rounded-xl border border-line">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('import.col.column') }}</th>
                <th>{{ t('import.col.needed') }}</th>
                <th class="hidden sm:table-cell">{{ t('import.col.what') }}</th>
                <th class="hidden md:table-cell">{{ t('import.col.example') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(f, i) in spec.fields" :key="f.key">
                <td class="font-medium">{{ f.label }}</td>
                <td>
                  <span v-if="f.required" class="badge bg-primary-soft text-primary">{{
                    t('common.required')
                  }}</span>
                  <span v-else class="text-xs text-ink-muted">{{ t('common.optional') }}</span>
                </td>
                <td class="hidden text-ink-muted sm:table-cell">{{ f.help }}</td>
                <td class="hidden font-mono text-xs text-ink-muted md:table-cell">
                  {{ spec.example[0]?.[i] || '—' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-xs text-ink-muted">{{ spec.matching }}</p>
      </section>

      <!-- 2. Choose file -->
      <section class="card space-y-3 p-5">
        <h2 class="font-semibold">{{ t('import.step2') }}</h2>
        <div
          v-if="!table"
          class="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition"
          :class="dragging ? 'border-primary bg-primary-soft' : 'border-line'"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileUp class="size-10 text-ink-muted" />
          <p class="font-medium">{{ t('import.drop') }}</p>
          <div class="flex flex-wrap justify-center gap-2">
            <label class="btn btn-primary cursor-pointer">
              <FileSpreadsheet class="size-4" /> {{ t('import.chooseFile') }}
              <input
                id="import-file"
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                class="sr-only"
                @change="onFile"
              />
            </label>
            <button class="btn btn-soft" @click="pasteOpen = !pasteOpen">
              <ClipboardPaste class="size-4" /> {{ t('import.paste') }}
            </button>
          </div>
          <p class="text-xs text-ink-muted">{{ t('import.fileTypes') }}</p>
        </div>
        <div v-else class="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <FileSpreadsheet class="size-6 text-primary" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ source }}</p>
            <p class="text-xs text-ink-muted">
              {{ rowsText(table.rows.length) }} ·
              {{ t('import.columns', { n: table.headers.length }) }}
            </p>
          </div>
          <button class="btn btn-ghost btn-sm" @click="reset">
            <X class="size-4" /> {{ t('common.remove') }}
          </button>
        </div>

        <div v-if="pasteOpen && !table" class="space-y-2">
          <label class="label" for="paste">
            {{ t('import.pasteHelp') }}
          </label>
          <textarea
            id="paste"
            v-model="pasted"
            rows="6"
            class="input font-mono text-xs"
            :placeholder="spec.fields.map((f) => f.label).join('\t')"
          />
          <button class="btn btn-primary btn-sm" :disabled="!pasted.trim()" @click="readPasted">
            {{ t('import.usePasted') }}
          </button>
        </div>
        <p v-if="readError" class="flex items-center gap-2 text-sm text-danger">
          <CircleAlert class="size-4" /> {{ readError }}
        </p>
      </section>

      <!-- 3. Match columns -->
      <section v-if="table" class="card space-y-3 p-5">
        <h2 class="font-semibold">{{ t('import.step3') }}</h2>
        <p class="text-sm text-ink-muted">
          {{ t('import.step3Help') }}
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="f in spec.fields" :key="f.key">
            <label class="label" :for="`map-${f.key}`">
              {{ f.label }}<span v-if="f.required" class="text-danger"> *</span>
            </label>
            <select
              :id="`map-${f.key}`"
              v-model="mapping[f.key]"
              class="input"
              :class="f.required && mapping[f.key] == null && 'border-danger'"
            >
              <option :value="null">— {{ t('import.notInFile') }} —</option>
              <option v-for="(h, i) in table.headers" :key="i" :value="i">{{ h }}</option>
            </select>
          </div>
        </div>
        <p v-if="missing.length" class="flex items-center gap-2 text-sm text-danger">
          <CircleAlert class="size-4" /> {{ t('import.chooseColumn') }}
          {{ missing.map((f) => f.label).join(', ') }}
        </p>
        <p v-if="unusedColumns.length" class="text-xs text-ink-muted">
          {{ t('import.notImported', { cols: unusedColumns.join(', ') }) }}
        </p>
      </section>

      <!-- 4. Review -->
      <section v-if="table && !missing.length" class="card space-y-3 p-5">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="flex-1 font-semibold">{{ t('import.step4') }}</h2>
          <span v-if="previewing" class="text-sm text-ink-muted">{{ t('import.checking') }}</span>
        </div>
        <template v-if="preview">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="f in [
                { id: 'all', label: `${t('common.all')} ${preview.rows.length}` },
                { id: 'create', label: `${t('import.result.create')} ${preview.created}` },
                { id: 'update', label: `${t('import.result.updates')} ${preview.updated}` },
                { id: 'skip', label: `${t('import.result.skip')} ${preview.skipped}` },
                { id: 'error', label: `${t('import.result.errors')} ${preview.failed}` },
              ] as const"
              :key="f.id"
              class="chip h-9"
              :class="[
                filter === f.id && 'chip-active',
                f.id === 'error' &&
                  preview.failed &&
                  filter !== f.id &&
                  'border-danger/50 text-danger',
              ]"
              :aria-pressed="filter === f.id"
              @click="filter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <div class="max-h-[28rem] overflow-auto rounded-xl border border-line">
            <table class="table">
              <thead class="sticky top-0 bg-surface">
                <tr>
                  <th class="w-16">{{ t('import.col.row') }}</th>
                  <th class="w-28">{{ t('import.col.result') }}</th>
                  <th>{{ kind === 'stock' ? t('products.product') : t('fields.name') }}</th>
                  <th>{{ t('import.col.details') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in shown.slice(0, 300)" :key="r.index">
                  <td class="text-ink-muted tabular-nums">{{ lineOf(r.index) }}</td>
                  <td>
                    <span class="badge" :class="actionStyle[r.action].cls">{{
                      t(actionStyle[r.action].label)
                    }}</span>
                  </td>
                  <td class="font-medium">{{ r.label }}</td>
                  <td :class="r.action === 'error' ? 'text-danger' : 'text-ink-muted'">
                    {{ r.message }}
                  </td>
                </tr>
                <tr v-if="!shown.length">
                  <td colspan="4" class="py-8 text-center text-ink-muted">
                    {{ t('import.nothing') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="shown.length > 300" class="text-xs text-ink-muted">
            {{ t('import.showingFirst', { n: shown.length }) }}
          </p>
        </template>
      </section>
    </template>

    <!-- Action bar -->
    <div
      v-if="preview && !done"
      class="card fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-5xl flex-wrap items-center gap-3 p-3 shadow-lg md:bottom-4 md:left-26"
    >
      <p class="min-w-0 flex-1 text-sm">
        <template v-if="toImport">
          {{ t('import.barSummary', { created: preview.created, updated: preview.updated }) }}
          <span v-if="preview.failed" class="text-danger">
            · {{ t('import.barFailed', { rows: rowsText(preview.failed) }) }}</span
          >
        </template>
        <template v-else-if="preview.failed">
          <span class="text-danger">{{ t('import.allErrors') }}</span> {{ t('import.fixFile') }}
        </template>
        <template v-else>{{ t('import.upToDate') }}</template>
      </p>
      <button class="btn btn-primary" :disabled="!toImport || importing" @click="runImport">
        {{
          importing ? t('import.importing') : t('import.importRows', { rows: rowsText(toImport) })
        }}
      </button>
    </div>
  </div>
</template>
