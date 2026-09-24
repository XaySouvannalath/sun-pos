// Reading CSV/Excel files for bulk import, matching columns to fields, and templates.
// The parsers are loaded only when needed to keep the main bundle small.
import type { ImportCell, ImportKind } from '@/types'
import { canDownload } from './env'
import { t, type MessageKey } from '@/i18n'

export interface ImportField {
  key: string
  label: string
  required?: boolean
  help: string
  /** Headings accepted for this field: key, English and translated label, and aliases. */
  names: string[]
}

export interface ImportSpec {
  kind: ImportKind
  title: string
  description: string
  /** How existing records are matched, shown to the user. */
  matching: string
  fields: ImportField[]
  example: string[][]
}

/** Import definitions. Visible text is in the translation files under import.* */
interface FieldDef {
  key: string
  required?: boolean
  /** English heading, always accepted when matching columns. */
  en: string
  /** Other headings that mean the same thing (compared without spaces or punctuation). */
  aliases: string[]
}

const defs: Record<ImportKind, { fields: FieldDef[]; example: string[][] }> = {
  products: {
    fields: [
      {
        key: 'name',
        required: true,
        en: 'Name',
        aliases: ['product', 'productname', 'item', 'itemname', 'menu', 'menuitem', 'title'],
      },
      {
        key: 'category',
        required: true,
        en: 'Category',
        aliases: ['categoryname', 'group', 'type', 'section'],
      },
      {
        key: 'price',
        required: true,
        en: 'Price',
        aliases: ['sellingprice', 'saleprice', 'unitprice', 'retailprice', 'priceusd'],
      },
      { key: 'cost', en: 'Cost', aliases: ['costprice', 'unitcost', 'buyprice', 'purchaseprice'] },
      { key: 'sku', en: 'SKU', aliases: ['code', 'itemcode', 'productcode', 'ref', 'reference'] },
      { key: 'barcode', en: 'Barcode', aliases: ['ean', 'upc', 'gtin', 'barcodenumber'] },
      { key: 'emoji', en: 'Icon', aliases: ['icon', 'emojiicon'] },
      {
        key: 'stock',
        en: 'Stock',
        aliases: ['quantity', 'qty', 'onhand', 'stockquantity', 'instock', 'stocklevel'],
      },
      {
        key: 'lowStockAt',
        en: 'Low stock alert',
        aliases: [
          'lowstock',
          'lowstockat',
          'reorderlevel',
          'reorderpoint',
          'minstock',
          'alertat',
          'minimum',
        ],
      },
      {
        key: 'active',
        en: 'Active',
        aliases: ['visible', 'show', 'status', 'enabled', 'available', 'onsale'],
      },
    ],
    example: [
      ['Iced Americano', 'Coffee', '3.25', '0.8', 'SKU-101', '8850000000101', '🧊', '', '5', 'yes'],
      ['Chocolate Croissant', 'Bakery', '3.50', '1.00', 'SKU-102', '', '🥐', '24', '5', 'yes'],
    ],
  },
  customers: {
    fields: [
      {
        key: 'name',
        required: true,
        en: 'Name',
        aliases: ['customer', 'customername', 'fullname', 'client'],
      },
      {
        key: 'phone',
        en: 'Phone',
        aliases: [
          'mobile',
          'tel',
          'telephone',
          'phonenumber',
          'mobilenumber',
          'whatsapp',
          'contact',
        ],
      },
      { key: 'email', en: 'Email', aliases: ['emailaddress', 'mail'] },
      { key: 'note', en: 'Note', aliases: ['notes', 'remark', 'remarks', 'comment', 'comments'] },
      {
        key: 'points',
        en: 'Points',
        aliases: ['loyaltypoints', 'point', 'balance', 'pointsbalance'],
      },
    ],
    example: [
      ['Somchai Phommachanh', '+856 20 5555 1234', 'somchai@example.com', 'Prefers oat milk', '40'],
      ['Noy Keomany', '+856 20 7777 8899', '', '', '0'],
    ],
  },
  staff: {
    fields: [
      {
        key: 'name',
        required: true,
        en: 'Name',
        aliases: ['staff', 'staffname', 'employee', 'employeename', 'fullname', 'user'],
      },
      { key: 'role', en: 'Role', aliases: ['position', 'level', 'type', 'jobtitle'] },
      { key: 'pin', en: 'PIN', aliases: ['pincode', 'passcode', 'code', 'password', 'loginpin'] },
    ],
    example: [
      ['Noy', 'Cashier', '5678'],
      ['Kham', 'Manager', '4321'],
    ],
  },
  stock: {
    fields: [
      {
        key: 'code',
        required: true,
        en: 'SKU or barcode',
        aliases: ['sku', 'barcode', 'productcode', 'itemcode', 'ean', 'code'],
      },
      {
        key: 'quantity',
        required: true,
        en: 'Counted quantity',
        aliases: ['qty', 'count', 'counted', 'stock', 'onhand', 'quantity'],
      },
      { key: 'reason', en: 'Reason', aliases: ['note', 'notes', 'remark', 'comment'] },
    ],
    example: [
      ['SKU-019', '24', 'Monthly count'],
      ['SKU-022', '6', 'Monthly count'],
    ],
  },
}

export const importKinds = Object.keys(defs) as ImportKind[]

/** The import definition for a type, with text in the current language. */
export function getSpec(kind: ImportKind): ImportSpec {
  const def = defs[kind]
  return {
    kind,
    title: t(`import.kinds.${kind}.title`),
    description: t(`import.kinds.${kind}.description`),
    matching: t(`import.kinds.${kind}.matching`),
    example: def.example,
    fields: def.fields.map((f) => {
      const base = `import.fields.${kind}.${f.key}` as const
      const label = t(`${base}.label` as MessageKey)
      const help = t(`${base}.help` as MessageKey)
      return {
        key: f.key,
        required: f.required,
        label,
        help: help === '—' ? '' : help,
        names: [f.key, f.en, label, ...f.aliases],
      }
    }),
  }
}

export interface ParsedTable {
  headers: string[]
  rows: ImportCell[][]
  /** Spreadsheet row number of each row in `rows` (the header is usually row 1). */
  lineNumbers: number[]
}

// Lower case without spaces or punctuation; keeps letters and vowel/tone marks in any script.
const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '')

function toCell(v: unknown): ImportCell {
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return v
  return String(v)
}

/** First non-empty row becomes the headers; empty rows are dropped. */
function toTable(raw: unknown[][]): ParsedTable {
  const numbered = raw
    .map((r, i) => ({ line: i + 1, cells: r.map(toCell) }))
    .filter((r) => r.cells.some((c) => c !== null && c !== ''))
  const [head, ...body] = numbered
  const headers = (head?.cells ?? []).map((h, i) =>
    h === null || h === '' ? `Column ${i + 1}` : String(h),
  )
  return { headers, rows: body.map((r) => r.cells), lineNumbers: body.map((r) => r.line) }
}

/** Parses CSV or tab-separated text (e.g. rows pasted from Excel or Google Sheets). */
export async function parseText(text: string): Promise<ParsedTable> {
  const { default: Papa } = await import('papaparse')
  const clean = text.replace(/^\uFEFF/, '')
  // Detect the separator (comma, semicolon, tab…) on the non-blank lines only: blank lines
  // would make every guess look inconsistent.
  const { delimiter } = Papa.parse(clean, { skipEmptyLines: 'greedy', preview: 50 }).meta
  // Then keep blank lines so row numbers match the spreadsheet; toTable() drops them.
  const res = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false })
  const fatal = res.errors.find((e) => e.type === 'Quotes')
  if (fatal)
    throw new Error(t('import.errors.csv', { row: (fatal.row ?? 0) + 1, message: fatal.message }))
  return toTable(res.data)
}

export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    return toTable((await readSheet(file)) as unknown[][])
  }
  if (name.endsWith('.xls') || name.endsWith('.numbers') || name.endsWith('.ods'))
    throw new Error(t('import.errors.fileType'))
  return parseText(await file.text())
}

/** Picks a file column for each field by comparing headings with the field's name and aliases. */
export function autoMap(headers: string[], spec: ImportSpec): Record<string, number | null> {
  const used = new Set<number>()
  const map: Record<string, number | null> = {}
  const heads = headers.map(normalize)
  // Exact matches on the field key/label first, then aliases, so "SKU" wins over "code".
  for (const pass of ['exact', 'alias'] as const) {
    for (const f of spec.fields) {
      if (map[f.key] !== undefined && map[f.key] !== null) continue
      const names =
        pass === 'exact' ? f.names.slice(0, 3).map(normalize) : f.names.slice(3).map(normalize)
      const i = heads.findIndex((h, idx) => !used.has(idx) && names.includes(h))
      if (i >= 0) {
        map[f.key] = i
        used.add(i)
      } else map[f.key] = null
    }
  }
  return map
}

/** Turns the table into row objects keyed by field, using the chosen column for each field. */
export function buildRows(
  table: ParsedTable,
  mapping: Record<string, number | null>,
): Record<string, ImportCell>[] {
  const pairs = Object.entries(mapping).filter((e): e is [string, number] => e[1] !== null)
  return table.rows.map((r) => Object.fromEntries(pairs.map(([key, col]) => [key, r[col] ?? null])))
}

function save(blob: Blob, filename: string) {
  if (!canDownload) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** CSV template with a byte-order mark so Excel reads Lao text and emoji correctly. */
export function downloadCsvTemplate(spec: ImportSpec) {
  const rows = [spec.fields.map((f) => f.label), ...spec.example]
  const csv = rows
    .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(','))
    .join('\r\n')
  save(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
    `sun-pos-${spec.kind}-template.csv`,
  )
}

/** Excel template. Every cell is text, so PINs and codes keep their leading zeros. */
export async function downloadExcelTemplate(spec: ImportSpec) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const header = spec.fields.map((f) => ({
    value: f.label,
    type: String,
    fontWeight: 'bold' as const,
  }))
  const body = spec.example.map((r) => r.map((value) => ({ value, type: String })))
  const blob = await writeXlsxFile([header, ...body], {
    sheet: spec.title,
    columns: spec.fields.map((f) => ({ width: Math.max(12, f.label.length + 4) })),
    stickyRowsCount: 1,
  }).toBlob()
  save(blob, `sun-pos-${spec.kind}-template.xlsx`)
}
