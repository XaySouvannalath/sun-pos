import { ref, watch, type Ref } from 'vue'

const PREFIX = 'sunpos:'

export type StorageKind = 'local' | 'session'

/** Browser storage can be missing or throw (private mode, sandboxed frames). */
function store(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readStorage<T>(key: string, kind: StorageKind = 'local'): T | undefined {
  try {
    const raw = store(kind)?.getItem(PREFIX + key)
    return raw == null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeStorage(key: string, value: unknown, kind: StorageKind = 'local') {
  try {
    store(kind)?.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: keep working in memory.
  }
}

/** A ref that is loaded from and saved to browser storage. */
export function persisted<T>(key: string, initial: () => T, kind?: StorageKind): Ref<T> {
  const r = ref(readStorage<T>(key, kind) ?? initial()) as Ref<T>
  watch(r, (v) => writeStorage(key, v, kind), { deep: true })
  return r
}

export function clearAllStorage() {
  for (const kind of ['local', 'session'] as const) {
    const s = store(kind)
    if (!s) continue
    try {
      for (const k of Object.keys(s)) if (k.startsWith(PREFIX)) s.removeItem(k)
    } catch {
      // ignore
    }
  }
}
