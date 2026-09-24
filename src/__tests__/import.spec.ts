import { beforeEach, describe, expect, it } from 'vitest'
import { autoMap, buildRows, getSpec, parseText } from '@/utils/importer'
import { createDb, memoryAdapter } from '@/mock/db'
import { createApi } from '@/mock/router'
import type { Customer, ImportResult, Product, StaffPublic } from '@/types'

describe('reading files', () => {
  it('reads CSV with quotes, a byte-order mark and blank lines', async () => {
    const t = await parseText('\uFEFFName,Price\n"Latte, large",4.5\n\n"Say ""hi""",1\n')
    expect(t.headers).toEqual(['Name', 'Price'])
    expect(t.rows).toEqual([
      ['Latte, large', '4.5'],
      ['Say "hi"', '1'],
    ])
    expect(t.lineNumbers).toEqual([2, 4])
  })

  it('reads semicolon CSV (European Excel) and tab-separated pasted rows', async () => {
    expect((await parseText('Name;Price\nTea;3,5')).rows).toEqual([['Tea', '3,5']])
    expect((await parseText('Name\tPrice\nTea\t3.5')).rows).toEqual([['Tea', '3.5']])
    // Pasted rows usually end with a newline, and may include blank lines.
    const pasted = await parseText('SKU\tCounted\nSKU-019\t18\n\nSKU-999\t4\n')
    expect(pasted.headers).toEqual(['SKU', 'Counted'])
    expect(pasted.lineNumbers).toEqual([2, 4])
  })

  it('matches column headings to fields, ignoring case and punctuation', async () => {
    const t = await parseText(
      'Product Name,Selling Price,Category Name,Qty,Item Code,Notes\nA,1,B,2,C,D',
    )
    const map = autoMap(t.headers, getSpec('products'))
    expect(map).toMatchObject({ name: 0, price: 1, category: 2, stock: 3, sku: 4, barcode: null })
    expect(buildRows(t, map)[0]).toMatchObject({
      name: 'A',
      price: '1',
      category: 'B',
      stock: '2',
      sku: 'C',
    })
  })
})

describe('import endpoints', () => {
  let api: ReturnType<typeof createApi>
  let token: string
  const call = <T>(method: string, path: string, body?: unknown) =>
    api.handle({ method, path, query: {}, body: body ?? null, token }) as {
      status: number
      body: T
    }
  const run = (kind: string, rows: unknown[], dryRun = false) =>
    call<ImportResult>('POST', `/import/${kind}`, { rows, dryRun }).body

  beforeEach(() => {
    api = createApi(createDb(memoryAdapter()))
    token = (
      api.handle({
        method: 'POST',
        path: '/auth/login',
        query: {},
        body: { pin: '1234' },
        token: null,
      }).body as { token: string }
    ).token
  })

  it('previews without saving, then imports valid rows and skips invalid ones', () => {
    const rows = [
      { name: 'Iced Americano', category: 'Coffee', price: '3.25', sku: 'SKU-101' },
      { name: 'Coconut Juice', category: 'Juices', price: '$2.50', stock: '12', active: 'yes' },
      { name: 'Broken', category: 'Coffee', price: 'free' },
      { name: 'Café Latte', category: 'Coffee', price: '4.00' }, // existing by name → update
    ]
    const preview = run('products', rows, true)
    expect(preview).toMatchObject({ dryRun: true, created: 2, updated: 1, failed: 1 })
    expect(preview.rows[1]!.message).toBe('New category: Juices')
    expect(preview.rows[2]).toMatchObject({ action: 'error', message: 'Price must be a number' })
    expect(call<Product[]>('GET', '/products').body.some((p) => p.name === 'Iced Americano')).toBe(
      false,
    )

    const result = run('products', rows)
    expect(result).toMatchObject({ dryRun: false, created: 2, updated: 1, failed: 1 })
    const products = call<Product[]>('GET', '/products').body
    expect(products.find((p) => p.name === 'Coconut Juice')).toMatchObject({
      price: 2.5,
      stock: 12,
    })
    expect(products.find((p) => p.name === 'Café Latte')!.price).toBe(4)
    // Re-importing the same file changes nothing.
    expect(run('products', rows.slice(0, 2))).toMatchObject({ created: 0, updated: 0, skipped: 2 })
  })

  it('reads numbers in local formats', () => {
    run('products', [
      { name: 'A', category: 'Coffee', price: '1,250.50' },
      { name: 'B', category: 'Coffee', price: '1.250,50' },
      { name: 'C', category: 'Coffee', price: '25 000' },
      { name: 'D', category: 'Coffee', price: '3,5' },
    ])
    const price = (n: string) =>
      call<Product[]>('GET', '/products').body.find((p) => p.name === n)!.price
    expect([price('A'), price('B'), price('C'), price('D')]).toEqual([1250.5, 1250.5, 25000, 3.5])
  })

  it('updates customers matched by phone and sets opening points', () => {
    const res = run('customers', [
      { name: 'Noy K.', phone: '+85620 7777 8899', points: '50' }, // same phone as seed customer
      { name: 'New Person', email: 'new@example.com' },
      { name: 'Bad Email', email: 'nope' },
    ])
    expect(res).toMatchObject({ created: 1, updated: 1, failed: 1 })
    const noy = call<Customer>('GET', '/customers/cus-2').body
    expect(noy).toMatchObject({ name: 'Noy K.', points: 50 })
  })

  it('creates staff, enforces PIN rules and explains lost leading zeros', () => {
    const res = run('staff', [
      { name: 'Kham', role: 'Manager', pin: '4321' },
      { name: 'Dup', role: 'cashier', pin: '1234' },
      { name: 'Zero', pin: 0 },
      { name: 'No Pin' },
    ])
    expect(res.rows.map((r) => r.action)).toEqual(['create', 'error', 'error', 'error'])
    expect(res.rows[1]!.message).toBe('That PIN is already used')
    expect(res.rows[2]!.message).toContain('format the PIN column as Text')
    const staff = call<StaffPublic[]>('GET', '/staff').body
    expect(staff.find((s) => s.name === 'Kham')?.role).toBe('admin')
  })

  it('sets stock from a count sheet and logs each change', () => {
    const res = run('stock', [
      { code: 'SKU-019', quantity: '24', reason: 'Monthly count' },
      { code: '8850000000001', quantity: 10 }, // Espresso by barcode: not tracked yet
      { code: 'NOPE', quantity: 1 },
    ])
    expect(res.rows.map((r) => r.action)).toEqual(['update', 'update', 'error'])
    expect(res.rows[1]!.message).toBe('Starts tracking stock: 10')
    expect(call<Product>('GET', '/products/prd-19').body.stock).toBe(24)
    const moves = call<{ reason: string }[]>('GET', '/stock/movements').body
    expect(moves.some((m) => m.reason === 'Monthly count')).toBe(true)
  })

  it('is for managers only', () => {
    token = (
      api.handle({
        method: 'POST',
        path: '/auth/login',
        query: {},
        body: { pin: '0000' },
        token: null,
      }).body as { token: string }
    ).token
    expect(call('POST', '/import/products', { rows: [{}] }).status).toBe(403)
  })
})
