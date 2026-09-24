import { computed } from 'vue'
import { defineStore } from 'pinia'
import { persisted } from '@/composables/persisted'
import { seedStaff } from '@/data/seed'
import { clone, uid } from '@/utils/pos'
import type { Role, Staff } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const staff = persisted<Staff[]>('staff', () => clone(seedStaff))
  // Session storage: a page refresh keeps you signed in, a closed tab locks the till.
  const currentId = persisted<string | null>('session-user', () => null, 'session')

  const user = computed(() => staff.value.find((u) => u.id === currentId.value) ?? null)
  const isAdmin = computed(() => user.value?.role === 'admin')

  function login(pin: string): boolean {
    const found = staff.value.find((u) => u.pin === pin)
    if (!found) return false
    currentId.value = found.id
    return true
  }

  function logout() {
    currentId.value = null
  }

  function saveStaff(data: Omit<Staff, 'id'> & { id?: string }): string | null {
    if (!/^\d{4,6}$/.test(data.pin)) return 'PIN must be 4–6 digits'
    if (staff.value.some((u) => u.pin === data.pin && u.id !== data.id))
      return 'That PIN is already used'
    if (data.id) {
      const existing = staff.value.find((u) => u.id === data.id)
      if (existing) {
        if (existing.role === 'admin' && data.role !== 'admin' && adminCount() <= 1)
          return 'At least one manager is required'
        Object.assign(existing, data)
      }
    } else {
      staff.value.push({ ...data, id: uid() })
    }
    return null
  }

  function adminCount() {
    return staff.value.filter((u) => u.role === 'admin').length
  }

  function removeStaff(id: string): string | null {
    const u = staff.value.find((x) => x.id === id)
    if (!u) return null
    if (u.id === currentId.value) return 'You cannot remove yourself'
    if (u.role === 'admin' && adminCount() <= 1) return 'At least one manager is required'
    staff.value = staff.value.filter((x) => x.id !== id)
    return null
  }

  const roleLabel = (r: Role) => (r === 'admin' ? 'Manager' : 'Cashier')

  return { staff, user, isAdmin, login, logout, saveStaff, removeStaff, roleLabel }
})
