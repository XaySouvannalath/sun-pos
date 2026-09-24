// Reading CSV/Excel files for bulk import, matching columns to fields, and templates.
// The parsers are loaded only when needed to keep the main bundle small.
import type { ImportCell, ImportKind } from '@/types'
import { canDownload } from './env'

export interface ImportField {
  key: string
  label: string
  required?: boolean
  /** Other column headings that mean the same thing (compared without spaces or punctuation). */
  aliases: string[]
  help: string
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

export const importSpecs: Record<ImportKind, ImportSpec> = {
  products: {
    kind: 'products',
    title: 'Products',
    description: 'Add new menu items or update prices, categories and details in bulk.',
    matching:
      'Rows update an existing product with the same SKU, barcode or name. Other rows create new products. Unknown categories are created.',
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['product', 'productname', 'item', 'itemname', 'menu', 'menuitem', 'title'],
        help: 'Product name',
      },
      {
        key: 'category',
        label: 'Category',
        required: true,
        aliases: ['categoryname', 'group', 'type', 'section'],
        help: 'Category name, e.g. Coffee',
      },
      {
        key: 'price',
        label: 'Price',
        required: true,
        aliases: ['sellingprice', 'saleprice', 'unitprice', 'retailprice', 'priceusd'],
        help: 'Selling price',
      },
      {
        key: 'cost',
        label: 'Cost',
        aliases: ['costprice', 'unitcost', 'buyprice', 'purchaseprice'],
        help: 'Cost per item, for profit reports',
      },
      {
        key: 'sku',
        label: 'SKU',
        aliases: ['code', 'itemcode', 'productcode', 'ref', 'reference'],
        help: 'Your product code',
      },
      {
        key: 'barcode',
        label: 'Barcode',
        aliases: ['ean', 'upc', 'gtin', 'barcodenumber'],
        help: 'For scanning',
      },
      { key: 'emoji', label: 'Icon', aliases: ['icon', 'emojiicon'], help: 'An emoji, e.g. ☕' },
      {
        key: 'stock',
        label: 'Stock',
        aliases: ['quantity', 'qty', 'onhand', 'stockquantity', 'instock', 'stocklevel'],
        help: 'Leave empty if you do not track stock',
      },
      {
        key: 'lowStockAt',
        label: 'Low stock alert',
        aliases: [
          'lowstock',
          'lowstockat',
          'reorderlevel',
          'reorderpoint',
          'minstock',
          'alertat',
          'minimum',
        ],
        help: 'Warn when stock falls to this',
      },
      {
        key: 'active',
        label: 'Active',
        aliases: ['visible', 'show', 'status', 'enabled', 'available', 'onsale'],
        help: 'yes or no (default yes)',
      },
    ],
    example: [
      ['Iced Americano', 'Coffee', '3.25', '0.8', 'SKU-101', '8850000000101', '🧊', '', '5', 'yes'],
      ['Chocolate Croissant', 'Bakery', '3.50', '1.00', 'SKU-102', '', '🥐', '24', '5', 'yes'],
    ],
  },
  customers: {
    kind: 'customers',
    title: 'Customers',
    description:
      'Bring in your customer list, for example from a previous system or a loyalty sign-up sheet.',
    matching:
      'Rows update an existing customer with the same phone number or email. Other rows create new customers.',
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['customer', 'customername', 'fullname', 'client'],
        help: 'Customer name',
      },
      {
        key: 'phone',
        label: 'Phone',
        aliases: [
          'mobile',
          'tel',
          'telephone',
          'phonenumber',
          'mobilenumber',
          'whatsapp',
          'contact',
        ],
        help: 'Used to find the customer again',
      },
      { key: 'email', label: 'Email', aliases: ['emailaddress', 'mail'], help: '' },
      {
        key: 'note',
        label: 'Note',
        aliases: ['notes', 'remark', 'remarks', 'comment', 'comments'],
        help: 'Allergies, preferences…',
      },
      {
        key: 'points',
        label: 'Points',
        aliases: ['loyaltypoints', 'point', 'balance', 'pointsbalance'],
        help: 'Opening loyalty points balance',
      },
    ],
    example: [
      ['Somchai Phommachanh', '+856 20 5555 1234', 'somchai@example.com', 'Prefers oat milk', '40'],
      ['Noy Keomany', '+856 20 7777 8899', '', '', '0'],
    ],
  },
  staff: {
    kind: 'staff',
    title: 'Staff',
    description: 'Add staff accounts, or change roles and PINs for several people at once.',
    matching:
      'Rows update an existing staff member with the same name. Other rows create new accounts.',
    fields: [
      {
        key: 'name',
        label: 'Name',
        required: true,
        aliases: ['staff', 'staffname', 'employee', 'employeename', 'fullname', 'user'],
        help: 'Name shown on receipts',
      },
      {
        key: 'role',
        label: 'Role',
        aliases: ['position', 'level', 'type', 'jobtitle'],
        help: 'Manager or Cashier (default Cashier)',
      },
      {
        key: 'pin',
        label: 'PIN',
        aliases: ['pincode', 'passcode', 'code', 'password', 'loginpin'],
        help: '4–6 digits; required for new staff',
      },
    ],
    example: [
      ['Noy', 'Cashier', '5678'],
      ['Kham', 'Manager', '4321'],
    ],
  },
  stock: {
    kind: 'stock',
    title: 'Stock count',
    description:
      'After counting the shelves, upload the counts to set all stock levels at once. Each change is logged.',
    matching:
      'Rows are matched to products by SKU or barcode. Products that did not track stock start tracking.',
    fields: [
      {
        key: 'code',
        label: 'SKU or barcode',
        required: true,
        aliases: ['sku', 'barcode', 'productcode', 'itemcode', 'ean', 'code'],
        help: 'Identifies the product',
      },
      {
        key: 'quantity',
        label: 'Counted quantity',
        required: true,
        aliases: ['qty', 'count', 'counted', 'stock', 'onhand', 'quantity'],
        help: 'The new stock level',
      },
      {
        key: 'reason',
        label: 'Reason',
        aliases: ['note', 'notes', 'remark', 'comment'],
        help: 'Optional, e.g. Monthly count',
      },
    ],
    example: [
      ['SKU-019', '24', 'Monthly count'],
      ['SKU-022', '6', 'Monthly count'],
    ],
  },
}

export interface ParsedTable {
  headers: string[]
  rows: ImportCell[][]
  /** Spreadsheet row number of each row in `rows` (the header is usually row 1). */
  lineNumbers: number[]
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

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
    throw new Error(`Could not read the CSV (row ${(fatal.row ?? 0) + 1}): ${fatal.message}`)
  return toTable(res.data)
}

export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    return toTable((await readSheet(file)) as unknown[][])
  }
  if (name.endsWith('.xls') || name.endsWith('.numbers') || name.endsWith('.ods'))
    throw new Error(
      'This file type is not supported. Save it as Excel (.xlsx) or CSV and try again.',
    )
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
        pass === 'exact' ? [normalize(f.key), normalize(f.label)] : f.aliases.map(normalize)
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
