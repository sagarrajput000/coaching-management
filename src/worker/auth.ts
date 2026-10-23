import { createFreebuffAuth, isSameOriginRequest } from '@freebuff/auth'
import type { FreebuffAuth, FreebuffUser } from '@freebuff/auth'
import type { Context, MiddlewareHandler } from 'hono'

import type { AppContext, Env } from './env'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

// One development identity, honoured only on a loopback origin when no client
// ID is configured. It lets the template run before auth is provisioned and
// can never activate on a deployed site (its origin is never loopback).
export const DEV_USER: FreebuffUser = {
  sub: 'dev-user',
  name: 'Alex Morgan',
  email: 'alex@yourcompany.com',
  email_verified: true,
}

export function isLoopback(request: Request): boolean {
  return LOOPBACK.has(new URL(request.url).hostname)
}

// Extra hostnames the development user is allowed on. Only meaningful while
// there is no FREEBUFF_CLIENT_ID (i.e. local runs): chat preview proxies hit
// the app on a non-loopback host, so those hosts are passed via
// DEV_EXTRA_HOSTS in .dev.vars / the local shell. A deployed site never sets
// it, so real deployments are unaffected.
function isAllowedDevHost(env: Env, request: Request): boolean {
  const extra = env.DEV_EXTRA_HOSTS ?? ''
  if (!extra) return false
  return extra
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
    .includes(new URL(request.url).hostname)
}

export function authMode(env: Env, request: Request): 'freebuff' | 'development' | 'off' {
  if (env.FREEBUFF_CLIENT_ID) return 'freebuff'
  return isLoopback(request) || isAllowedDevHost(env, request) ? 'development' : 'off'
}

let cached: { key: string; auth: FreebuffAuth } | undefined

/** One auth instance per isolate; recreated only if the config changes. */
export function getAuth(env: Env, request: Request): FreebuffAuth | null {
  if (!env.FREEBUFF_CLIENT_ID) return null
  const baseUrl = env.APP_ORIGIN ?? new URL(request.url).origin
  const key = `${env.FREEBUFF_CLIENT_ID}|${env.FREEBUFF_ISSUER ?? ''}|${baseUrl}`
  if (cached?.key !== key) {
    cached = {
      key,
      auth: createFreebuffAuth({
        clientId: env.FREEBUFF_CLIENT_ID,
        issuer: env.FREEBUFF_ISSUER || undefined,
        baseUrl,
        allowInsecureLocalhost: new URL(baseUrl).protocol === 'http:' && LOOPBACK.has(new URL(baseUrl).hostname),
      }),
    }
  }
  return cached.auth
}

export async function currentUser(env: Env, request: Request): Promise<FreebuffUser | null> {
  const auth = getAuth(env, request)
  if (auth) return auth.getUser(request)
  return authMode(env, request) === 'development' ? DEV_USER : null
}

export function appOrigin(env: Env, request: Request): string {
  return env.APP_ORIGIN ?? new URL(request.url).origin
}

/** Requires a signed-in user and, for mutations, a same-origin request. */
export const requireUser: MiddlewareHandler<AppContext> = async (c, next) => {
  const request = c.req.raw
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isSameOriginRequest(request, appOrigin(c.env, request))) {
    return c.json({ error: 'Cross-origin request refused.' }, 403)
  }
  const user = await currentUser(c.env, request)
  if (!user) return c.json({ error: 'Sign in required.' }, 401)
  c.set('user', user)
  await next()
}

export function privateJson<T>(c: Context<AppContext>, body: T, status = 200) {
  c.header('Cache-Control', 'private, no-store')
  return c.json(body as never, status as never)
}
