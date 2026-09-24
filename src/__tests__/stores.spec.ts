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
})
