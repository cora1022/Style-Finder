const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''

let accessToken: string | null = null
let refreshPromise: Promise<string> | null = null
let loginPromise: Promise<Member> | null = null
const sessionListeners = new Set<(reason: 'expired' | 'logout' | 'manual') => void>()

export type Member = {
  id: number
  email: string
  displayName: string
  role: string
}

type TokenResponse = {
  accessToken: string
  tokenType: string
  expiresIn: number
}

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    requestId?: string
    fields?: Record<string, string>
  }
}

export class MemberApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields: Record<string, string>

  constructor(code: string, message: string, status: number, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'MemberApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

export const session = {
  get token() {
    return accessToken
  },
  clear(reason: 'expired' | 'logout' | 'manual' = 'manual') {
    accessToken = null
    sessionListeners.forEach((listener) => listener(reason))
  },
  subscribe(listener: (reason: 'expired' | 'logout' | 'manual') => void) {
    sessionListeners.add(listener)
    return () => {
      sessionListeners.delete(listener)
    }
  },
}

function memberUrl(path: string) {
  return `${base}/api/members${path}`
}

async function apiError(response: Response) {
  let body: ErrorEnvelope = {}
  try {
    body = (await response.json()) as ErrorEnvelope
  } catch {
    // The public error remains stable even if a proxy returns a non-JSON body.
  }
  return new MemberApiError(
    body.error?.code || 'MEMBER_REQUEST_FAILED',
    body.error?.message || '회원 요청을 처리하지 못했습니다.',
    response.status,
    body.error?.fields,
  )
}

function jsonHeaders(init: RequestInit) {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

async function publicRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(memberUrl(path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15000),
    credentials: 'include',
    headers: jsonHeaders(init),
  })
  if (!response.ok) throw await apiError(response)
  return response
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = publicRequest('/token/refresh', { method: 'POST' })
      .then((response) => response.json() as Promise<TokenResponse>)
      .then((tokens) => {
        accessToken = tokens.accessToken
        return tokens.accessToken
      })
      .catch((error) => {
        accessToken = null
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const execute = (token: string | null) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, credentials: 'include', headers })
  }

  const attemptedToken = accessToken
  let response = await execute(attemptedToken)
  if (response.status !== 401 || !attemptedToken) return response

  try {
    if (accessToken === attemptedToken) await refreshAccessToken()
  } catch {
    session.clear('expired')
    return response
  }
  response = await execute(accessToken)
  if (response.status === 401) session.clear('expired')
  return response
}

async function protectedRequest(path: string, init: RequestInit = {}) {
  const response = await authorizedFetch(memberUrl(path), {
    ...init,
    headers: jsonHeaders(init),
  })
  if (!response.ok) throw await apiError(response)
  return response
}

export function login(email: string, password: string): Promise<Member> {
  if (!loginPromise) {
    loginPromise = publicRequest('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
      .then((response) => response.json() as Promise<TokenResponse>)
      .then((tokens) => {
        accessToken = tokens.accessToken
        return me().catch((error) => {
          accessToken = null
          throw error
        })
      })
      .finally(() => {
        loginPromise = null
      })
  }
  return loginPromise
}

export async function signup(email: string, password: string, displayName: string) {
  const response = await publicRequest('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  })
  return (await response.json()) as Member
}

export async function me(): Promise<Member> {
  const response = await protectedRequest('/me')
  return (await response.json()) as Member
}

export async function restoreSession(): Promise<Member | null> {
  try {
    await refreshAccessToken()
    return await me()
  } catch {
    session.clear()
    return null
  }
}

export async function logout() {
  try {
    if (accessToken) {
      const response = await authorizedFetch(memberUrl('/logout'), { method: 'POST' })
      if (!response.ok && response.status !== 401) throw await apiError(response)
    }
  } finally {
    session.clear('logout')
  }
}

export function memberErrorMessage(error: unknown, fallback: string) {
  if (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
    return '연결이 지연되고 있어요. 잠시 후 다시 시도해주세요.'
  if (!(error instanceof MemberApiError)) return fallback
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: '이메일 또는 비밀번호를 확인해주세요.',
    EMAIL_ALREADY_EXISTS: '이미 가입된 이메일입니다.',
    REFRESH_TOKEN_INVALID: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    REFRESH_TOKEN_EXPIRED: '로그인이 만료되었습니다. 다시 로그인해주세요.',
    VALIDATION_ERROR: '입력한 회원 정보를 확인해주세요.',
    PASSWORD_TOO_LONG: '비밀번호는 72바이트 이하로 입력해주세요.',
  }
  if (error.status >= 500) return '서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.'
  return messages[error.code] || error.message || fallback
}
