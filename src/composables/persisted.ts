import { ref, watch, type Ref } from 'vue'

const PREFIX = 'sunpos:'

export function readStorage<T>(key: string, storage: Storage = localStorage): T | undefined {
  try {
    const raw = storage.getItem(PREFIX + key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeStorage(key: string, value: unknown, storage: Storage = localStorage) {
  try {
    storage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
}

/** A ref that is loaded from and saved to browser storage. */
export function persisted<T>(key: string, initial: () => T, storage?: Storage): Ref<T> {
  const r = ref(readStorage<T>(key, storage) ?? initial()) as Ref<T>
  watch(r, (v) => writeStorage(key, v, storage), { deep: true })
  return r
}

export function clearAllStorage() {
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  }
}
