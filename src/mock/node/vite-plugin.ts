// Serves the mock API from the Vite dev and preview servers at /api/v1.
// Data is saved to .mock-db.json in the project root (git-ignored);
// delete it or run `npm run mock:reset` to start again from src/mock/data/*.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import type { DbData } from '../../types.ts'
import { createDb, type DbAdapter } from '../db.ts'
import { createApi } from '../router.ts'

export const MOCK_DB_FILE = '.mock-db.json'

function fileAdapter(file: string): DbAdapter {
  return {
    load() {
      if (!existsSync(file)) return null
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as DbData
      } catch {
        console.warn(`[mock-api] ${file} is not valid JSON, starting from the seed data`)
        return null
      }
    },
    save(data) {
      writeFileSync(file, JSON.stringify(data))
    },
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((ok, fail) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (c: string) => (raw += c))
    req.on('end', () => {
      if (!raw) return ok(null)
      try {
        ok(JSON.parse(raw))
      } catch {
        fail(new Error('Request body is not valid JSON'))
      }
    })
    req.on('error', fail)
  })
}

export function mockApi(options: { base?: string; delayMs?: number } = {}): Plugin {
  const base = options.base ?? '/api/v1'
  let api: ReturnType<typeof createApi> | null = null

  const middleware: Connect.NextHandleFunction = async (req, res: ServerResponse, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(base + '/') && url.pathname !== base) return next()
    api ??= createApi(createDb(fileAdapter(resolve(process.cwd(), MOCK_DB_FILE))))

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Mock-Api', 'sun-pos')
    let body: unknown = null
    try {
      body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req)
    } catch (e) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: { code: 'INVALID_JSON', message: (e as Error).message } }))
      return
    }
    const auth = req.headers.authorization ?? ''
    const result = api.handle({
      method: req.method ?? 'GET',
      path: url.pathname.slice(base.length) || '/',
      query: Object.fromEntries(url.searchParams),
      body,
      token: auth.startsWith('Bearer ') ? auth.slice(7) : null,
    })
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs))
    res.statusCode = result.status
    res.end(result.status === 204 ? undefined : JSON.stringify(result.body))
  }

  return {
    name: 'sun-pos-mock-api',
    configureServer(server) {
      server.middlewares.use(middleware)
      server.config.logger.info(`  ➜  Mock API: ${base} (data in ${MOCK_DB_FILE})`)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
