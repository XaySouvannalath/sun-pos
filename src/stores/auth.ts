import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api, hasToken, setToken } from '@/api'
import { t } from '@/i18n'
import { useSettingsStore } from './settings'
import { persisted } from '@/composables/persisted'
import type { Branch, Role, StaffInput, StaffPublic } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<StaffPublic | null>(null)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const staff = ref<StaffPublic[]>([])

  // Branches. Each till (device) remembers its branch, like its language.
  const branches = ref<Branch[]>([])
  const deviceBranch = persisted<string>('branch', () => '')
  const branchId = ref('')
  const branch = computed(() => branches.value.find((b) => b.id === branchId.value) ?? null)
  const multiBranch = computed(() => branches.value.length > 1)
  /** Branches the signed-in person can work at. */
  const myBranches = computed(() =>
    branches.value.filter(
      (b) => !user.value?.branchIds?.length || user.value.branchIds.includes(b.id),
    ),
  )

  async function loadBranches() {
    branches.value = await api.branches.list()
    if (!branches.value.some((b) => b.id === deviceBranch.value))
      deviceBranch.value = branches.value[0]?.id ?? ''
  }

  let ready: Promise<void> | null = null

  /** Loads the store settings and restores a saved session. Runs once. */
  function init() {
    ready ??= (async () => {
      await Promise.all([
        useSettingsStore()
          .load()
          .catch(() => {}),
        loadBranches().catch(() => {}),
      ])
      if (!hasToken()) return
      try {
        const s = await api.auth.session()
        user.value = s.user
        branchId.value = s.branchId
      } catch {
        setToken(null)
      }
    })()
    return ready
  }

  /** Returns false for a wrong PIN; other failures (e.g. no connection) throw. */
  async function login(pin: string): Promise<boolean> {
    try {
      const res = await api.auth.login(pin, deviceBranch.value || undefined)
      setToken(res.token)
      user.value = res.user
      branchId.value = res.branchId
      return true
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return false
      throw e
    }
  }

  /** Moves this till to another branch; the caller reloads the branch's data. */
  async function switchBranch(id: string) {
    const res = await api.auth.switchBranch(id)
    branchId.value = res.branchId
    deviceBranch.value = res.branchId
  }

  async function saveBranch(b: Partial<Branch> & { name: string }) {
    const { id, ...body } = b
    if (id) await api.branches.update(id, body)
    else await api.branches.create({ address: '', phone: '', ...body })
    await loadBranches()
  }

  /** Returns an error message, or null. */
  async function removeBranch(id: string): Promise<string | null> {
    try {
      await api.branches.remove(id)
      await loadBranches()
      return null
    } catch (e) {
      if (e instanceof ApiError) return e.message
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
    branches,
    deviceBranch,
    branchId,
    branch,
    multiBranch,
    myBranches,
    loadBranches,
    switchBranch,
    saveBranch,
    removeBranch,
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
