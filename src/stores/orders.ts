import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { buildDemoOrders, defaultSettings, seedProducts, seedStaff } from '@/data/seed'
import { clone, uid } from '@/utils/pos'
import { useCatalogStore } from './catalog'
import { useCustomersStore } from './customers'
import { useAuthStore } from './auth'
import { useShiftStore } from './shift'
import type { Order, Product } from '@/types'

export interface TopSeller {
  product: Product
  qty: number
  revenue: number
}

export type NewOrder = Omit<
  Order,
  'id' | 'number' | 'createdAt' | 'staffId' | 'staffName' | 'shiftId' | 'status' | 'refund'
>

/** Aggregate quantity and revenue per product for completed orders since `since`. */
export function rankProducts(
  orders: Order[],
  products: Map<string, Product>,
  since: number,
): TopSeller[] {
  const agg = new Map<string, { qty: number; revenue: number }>()
  for (const o of orders) {
    if (o.status !== 'completed' || o.createdAt < since) continue
    for (const l of o.lines) {
      const a = agg.get(l.productId) ?? { qty: 0, revenue: 0 }
      a.qty += l.qty
      a.revenue += l.unitPrice * l.qty * (1 - l.discountPct / 100)
      agg.set(l.productId, a)
    }
  }
  const out: TopSeller[] = []
  for (const [id, a] of agg) {
    const product = products.get(id)
    if (product) out.push({ product, ...a })
  }
  return out.sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
}

export const useOrdersStore = defineStore('orders', () => {
  const orders = persisted<Order[]>('orders', () =>
    buildDemoOrders(seedProducts, defaultSettings, seedStaff),
  )

  const nextNumber = computed(() => orders.value.reduce((m, o) => Math.max(m, o.number), 0) + 1)
  const byId = computed(() => new Map(orders.value.map((o) => [o.id, o])))

  function topSellers(days: number, limit = 8): TopSeller[] {
    const catalog = useCatalogStore()
    const since = Date.now() - days * 86400000
    return rankProducts(orders.value, catalog.byId, since)
      .filter((t) => t.product.active)
      .slice(0, limit)
  }

  function complete(draft: NewOrder): Order {
    const auth = useAuthStore()
    const catalog = useCatalogStore()
    const customers = useCustomersStore()
    const shift = useShiftStore()

    const order: Order = {
      ...clone(draft),
      id: uid(),
      number: nextNumber.value,
      createdAt: Date.now(),
      staffId: auth.user?.id ?? '',
      staffName: auth.user?.name ?? '',
      shiftId: shift.current?.id ?? null,
      status: 'completed',
      refund: null,
    }
    orders.value.unshift(order)

    for (const l of order.lines)
      catalog.adjustStock(l.productId, -l.qty, `Sale #${order.number}`, order.staffName)
    if (order.customerId)
      customers.recordPurchase(order.customerId, order.total, order.pointsEarned)
    return order
  }

  function refund(id: string, reason: string, restock: boolean) {
    const auth = useAuthStore()
    const catalog = useCatalogStore()
    const customers = useCustomersStore()
    const shift = useShiftStore()
    const o = byId.value.get(id)
    if (!o || o.status !== 'completed') return
    o.status = 'refunded'
    o.refund = {
      at: Date.now(),
      by: auth.user?.name ?? '',
      reason,
      shiftId: shift.current?.id ?? null,
    }
    if (restock)
      for (const l of o.lines)
        catalog.adjustStock(l.productId, l.qty, `Refund #${o.number}`, o.refund.by)
    if (o.customerId) customers.recordPurchase(o.customerId, o.total, o.pointsEarned, -1)
  }

  function clearAll() {
    orders.value = []
  }

  function loadDemo() {
    const catalog = useCatalogStore()
    const auth = useAuthStore()
    orders.value = buildDemoOrders(catalog.products, defaultSettings, auth.staff)
  }

  return { orders, nextNumber, byId, topSellers, complete, refund, clearAll, loadDemo }
})
