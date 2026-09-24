// Runs the mock API inside the browser, saving to localStorage.
// Used when there is no server at all (VITE_API_MODE=local, e.g. the single-file preview).
import { readStorage, writeStorage } from '@/composables/persisted'
import type { DbData } from '@/types'
import { createDb } from './db'
import { createApi } from './router'

const KEY = 'mock-db'

export const browserApi = createApi(
  createDb({
    load: () => readStorage<DbData>(KEY) ?? null,
    save: (data) => writeStorage(KEY, data),
  }),
)
