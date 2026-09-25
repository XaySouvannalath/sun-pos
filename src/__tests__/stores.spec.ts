// End-to-end store tests: the stores talk to the mock API running in the browser
// (VITE_API_MODE=local is set for tests in vitest.config.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.resetModules() // fresh mock database for each test
  setActivePinia(createPinia())
})

async function signedIn() {
  const { useAuthStore } = await import('@/stores/auth')
  const { useAppStore } = await import('@/stores/app')
  const auth = useAuthStore()
  await auth.init()
  expect(await auth.login('1234')).toBe(true)
  await useAppStore().load()
  return auth
}

describe('stores over the API', () => {
  it('rings up a sale from cart to server', async () => {
    await signedIn()
    const { useCartStore } = await import('@/stores/cart')
    const { useCatalogStore } = await import('@/stores/catalog')
    const { useShiftStore } = await import('@/stores/shift')
    const cart = useCartStore()
    const catalog = useCatalogStore()
    const shift = useShiftStore()

    await shift.open(100)
    const croissant = catalog.products.find((p) => p.name === 'Butter Croissant')!
    const before = croissant.stock!
    cart.add(croissant)
    cart.add(croissant)
    expect(cart.state.lines).toHaveLength(1)
    expect(cart.totals.total).toBe(6.05)

    const order = await cart.checkout([{ method: 'cash', amount: 10 }])
    expect(order).toMatchObject({ total: 6.05, change: 3.95, staffName: 'Manager' })
    expect(cart.isEmpty).toBe(true)

    await vi.waitFor(() => {
      expect(catalog.byId.get(croissant.id)!.stock).toBe(before - 2)
      expect(shift.summary?.expectedCash).toBe(106.05)
    })
  })

  it('holds an order on the server and resumes it', async () => {
    await signedIn()
    const { useCartStore } = await import('@/stores/cart')
    const { useCatalogStore } = await import('@/stores/catalog')
    const cart = useCartStore()
    cart.add(useCatalogStore().products[0]!)
    cart.state.table = '5'
    await cart.hold('Table 5')
    expect(cart.isEmpty).toBe(true)
    expect(cart.held).toHaveLength(1)
    await cart.resume(cart.held[0]!.id)
    expect(cart.state.table).toBe('5')
    expect(cart.held).toHaveLength(0)
  })

  it('reports a wrong PIN without throwing', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    expect(await useAuthStore().login('1111')).toBe(false)
  })

  it('loads top sellers after sign-in', async () => {
    await signedIn()
    const { useOrdersStore } = await import('@/stores/orders')
    expect(useOrdersStore().topSellers.length).toBeGreaterThan(0)
  })

  it('splits a bill by items: charges the picked items and keeps the rest', async () => {
    await signedIn()
    const { useCartStore } = await import('@/stores/cart')
    const { useCatalogStore } = await import('@/stores/catalog')
    const { useShiftStore } = await import('@/stores/shift')
    const cart = useCartStore()
    const catalog = useCatalogStore()
    await useShiftStore().open(0)

    const croissant = catalog.products.find((p) => p.name === 'Butter Croissant')!
    cart.add(croissant, [], 3)
    cart.state.discount = { type: 'amount', value: 1.5 }
    const id = cart.state.lines[0]!.id!

    // 1 of 3 croissants: a third of the $1.50 discount goes with it.
    const part = cart.selectionTotals({ [id]: 1 })
    expect(part).toMatchObject({ subtotal: 2.75, discount: 0.5 })
    const order = await cart.checkout([{ method: 'card', amount: part.total }], {
      selection: { [id]: 1 },
    })
    expect(order).toMatchObject({ itemCount: 1, discount: 0.5, total: part.total })
    expect(cart.state.lines[0]!.qty).toBe(2)
    expect(cart.state.discount).toEqual({ type: 'amount', value: 1 })

    await cart.checkout([{ method: 'cash', amount: 100 }], { selection: { [id]: 2 } })
    expect(cart.isEmpty).toBe(true)
  })

  it('splits a bill equally between guests', async () => {
    const { equalShares } = await import('@/stores/cart')
    expect(equalShares(10, 3, 2)).toEqual([3.33, 3.33, 3.34])
    expect(equalShares(10000, 3, 0)).toEqual([3333, 3333, 3334])
  })

  it('merges held bills into the current order', async () => {
    await signedIn()
    const { useCartStore } = await import('@/stores/cart')
    const { useCatalogStore } = await import('@/stores/catalog')
    const cart = useCartStore()
    const croissant = useCatalogStore().products.find((p) => p.name === 'Butter Croissant')!

    cart.add(croissant)
    cart.state.table = '5'
    cart.state.discount = { type: 'amount', value: 1 }
    await cart.hold('Table 5')
    cart.add(croissant, [], 2)
    cart.state.table = '6'
    cart.state.discount = { type: 'amount', value: 2 }
    await cart.hold('Table 6')

    await cart.mergeHeld(cart.held.map((h) => h.id))
    expect(cart.held).toHaveLength(0)
    expect(cart.state.lines).toHaveLength(1)
    expect(cart.state.lines[0]!.qty).toBe(3)
    expect(cart.state.table).toMatch(/^[56] \+ [56]$/)
    expect(cart.state.discount).toEqual({ type: 'amount', value: 3 })
  })
})
