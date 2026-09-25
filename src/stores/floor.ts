import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { FloorPlan } from '@/types'

/** The floor plan: areas and tables. Table bills are held orders (see the cart store). */
export const useFloorStore = defineStore('floor', () => {
  const plan = ref<FloorPlan>({ areas: [], tables: [] })
  const tableById = computed(() => new Map(plan.value.tables.map((t) => [t.id, t])))
  const hasTables = computed(() => plan.value.tables.length > 0)

  async function load() {
    plan.value = await api.floor.get()
  }

  async function save(next: FloorPlan) {
    plan.value = await api.floor.save(next)
  }

  return { plan, tableById, hasTables, load, save }
})
