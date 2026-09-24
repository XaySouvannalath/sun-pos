import { readStorage, writeStorage } from '@/composables/persisted'
import { embedded } from '@/utils/env'

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
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check the connection.')
  }
  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ApiError(
        res.status,
        'INVALID_RESPONSE',
        `The server sent an unexpected response (${res.status})`,
      )
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
  throw new ApiError(
    res.status,
    err?.code ?? `HTTP_${res.status}`,
    err?.message ?? `Request failed (${res.status})`,
  )
}
