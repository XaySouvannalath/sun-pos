import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api, hasToken, setToken } from '@/api'
import { t } from '@/i18n'
import { useSettingsStore } from './settings'
import type { Role, StaffInput, StaffPublic } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<StaffPublic | null>(null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const staff = ref<StaffPublic[]>([])

  let ready: Promise<void> | null = null

  /** Loads the store settings and restores a saved session. Runs once. */
  function init() {
    ready ??= (async () => {
      await useSettingsStore()
        .load()
        .catch(() => {})
      if (!hasToken()) return
      try {
        user.value = await api.auth.me()
      } catch {
        setToken(null)
      }
    })()
    return ready
  }

  /** Returns false for a wrong PIN; other failures (e.g. no connection) throw. */
  async function login(pin: string): Promise<boolean> {
    try {
      const res = await api.auth.login(pin)
      setToken(res.token)
      user.value = res.user
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return false
      throw e
    }
  }

  /** Forget the session locally (e.g. after the server rejects the token). */
  function clear() {
    setToken(null)
    user.value = null
  }

  async function logout() {
    await api.auth.logout().catch(() => {})
    clear()
  }

  async function loadStaff() {
    staff.value = await api.staff.list()
  }

  /** Creates or updates a staff member. Returns an error message, or null on success. */
  async function saveStaff(data: StaffInput & { id?: string }): Promise<string | null> {
    try {
      const { id, ...body } = data
      if (id) {
        const saved = await api.staff.update(id, body)
        if (saved.id === user.value?.id) user.value = saved
      } else await api.staff.create(body)
      await loadStaff()
      return null
    } catch (e) {
      if (e instanceof ApiError) return e.message
      throw e
    }
  }

  async function removeStaff(id: string): Promise<string | null> {
    try {
      await api.staff.remove(id)
      await loadStaff()
      return null
    } catch (e) {
      if (e instanceof ApiError) return e.message
      throw e
    }
  }

  const roleLabel = (r: Role) => t(`roles.${r}`)

  return {
    user,
    isAdmin,
    staff,
    init,
    login,
    logout,
    clear,
    loadStaff,
    saveStaff,
    removeStaff,
    roleLabel,
  }
})
