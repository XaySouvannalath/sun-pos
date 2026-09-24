import { canDownload } from './env'

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  if (!canDownload) return
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** Saves a JSON value as a file. Does nothing where downloads are unavailable. */
export function downloadJson(filename: string, value: unknown) {
  if (!canDownload) return
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
