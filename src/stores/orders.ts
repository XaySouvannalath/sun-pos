import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { useSettingsStore } from './settings'
import { useCatalogStore } from './catalog'
import { useShiftStore } from './shift'
import { useCustomersStore } from './customers'
import type { Order, TopSeller } from '@/types'

export const useOrdersStore = defineStore('orders', () => {
  const topSellers = ref<TopSeller[]>([])

  async function loadTopSellers() {
    topSellers.value = await api.orders.topSellers({
      days: useSettingsStore().s.topSellerDays,
      limit: 8,
    })
  }

  async function refund(
    id: string,
    reason: string,
    restock: boolean,
    approvalId?: string | null,
  ): Promise<Order> {
    const order = await api.orders.refund(id, { reason, restock, approvalId })
    // Stock, the drawer and the customer's points changed on the server.
    void Promise.allSettled([
      useCatalogStore().refreshProducts(),
      useShiftStore().load(),
      loadTopSellers(),
      order.customerId ? useCustomersStore().refresh(order.customerId) : null,
    ])
    return order
  }

  return { topSellers, loadTopSellers, refund }
})
