import { readStorage, writeStorage } from '@/composables/persisted'
import { embedded } from '@/utils/env'
import { t, type MessageKey } from '@/i18n'

/**
 * Where API calls go:
 * - "http" (default): fetch to VITE_API_URL (default "/api/v1"). In `npm run dev` that path is
 *   served by the mock API, or proxied to your backend when VITE_API_PROXY is set.
 * - "local": the mock API runs inside the browser and saves to localStorage (no server needed).
 */
export const apiMode: 'http' | 'local' =
  import.meta.env.VITE_API_MODE === 'local' || embedded ? 'local' : 'http'

export const apiBaseUrl: string = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Error codes with a fixed meaning are shown in the user's language. Messages that name
 * a field or a value (e.g. validation errors) keep the server's wording.
 */
const translatedCodes = [
  'INVALID_PIN',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NO_OPEN_SHIFT',
  'SHIFT_ALREADY_OPEN',
  'ALREADY_REFUNDED',
  'STOCK_NOT_TRACKED',
  'CATEGORY_NOT_EMPTY',
  'PIN_TAKEN',
  'BARCODE_TAKEN',
  'LAST_MANAGER',
  'CANNOT_DELETE_SELF',
  'INVALID_PIN_FORMAT',
  'EMPTY_ORDER',
  'OVERPAID_NON_CASH',
  'INSUFFICIENT_PAYMENT',
  'OUT_OF_STOCK',
  'INVALID_BACKUP',
] as const

function errorMessage(code: string, serverMessage: string | undefined, status: number): string {
  if ((translatedCodes as readonly string[]).includes(code))
    return t(`errors.${code}` as MessageKey)
  return serverMessage ?? t('errors.requestFailed', { status })
}

type Query = Record<string, string | number | boolean | null | undefined>

// The session token survives a page reload but not closing the tab.
let token: string | null = readStorage<string>('token', 'session') ?? null

export function setToken(t: string | null) {
  token = t
  writeStorage('token', t, 'session')
}

export function hasToken() {
  return !!token
}

/** Called when the server says the session is no longer valid. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

function cleanQuery(query?: Query): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(query ?? {}))
    if (v !== undefined && v !== null && v !== '') out[k] = String(v)
  return out
}

async function send(
  method: string,
  path: string,
  query: Record<string, string>,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  if (apiMode === 'local') {
    const { browserApi } = await import('@/mock/browser')
    // Round-trip through JSON so callers never share objects with the mock database.
    const res = browserApi.handle({ method, path, query, body: body ?? null, token })
    return {
      status: res.status,
      body: res.body == null ? null : JSON.parse(JSON.stringify(res.body)),
    }
  }

  const qs = new URLSearchParams(query).toString()
  let res: Response
  try {
    res = await fetch(`${apiBaseUrl}${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', t('errors.NETWORK_ERROR'))
  }
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, 'INVALID_RESPONSE', t('errors.INVALID_RESPONSE'))
    }
  }
  return { status: res.status, body: parsed }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const res = await send(method, path, cleanQuery(opts.query), opts.body)
  if (res.status >= 200 && res.status < 300) return res.body as T
  const err = (res.body as { error?: { code?: string; message?: string } } | null)?.error
  if (res.status === 401 && path !== '/auth/login') onUnauthorized?.()
  const code = err?.code ?? `HTTP_${res.status}`
  throw new ApiError(res.status, code, errorMessage(code, err?.message, res.status))
}
