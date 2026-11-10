import { beforeEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('member session API', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('restores a member using the HttpOnly refresh cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: 'restored-access', tokenType: 'Bearer', expiresIn: 900 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: 1, email: 'member@example.com', displayName: '회원', role: 'USER' }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const { restoreSession, session } = await import('./members')

    const member = await restoreSession()

    expect(member?.email).toBe('member@example.com')
    expect(session.token).toBe('restored-access')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/members/token/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    expect(fetchMock.mock.calls[1][1].headers.get('Authorization')).toBe('Bearer restored-access')
  })

  it('uses one refresh request for concurrent 401 responses and retries once', async () => {
    let refreshCalls = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/login')) {
        return jsonResponse({ accessToken: 'old-access', tokenType: 'Bearer', expiresIn: 1 })
      }
      if (url.endsWith('/me')) {
        return jsonResponse({
          id: 1,
          email: 'member@example.com',
          displayName: '회원',
          role: 'USER',
        })
      }
      if (url.endsWith('/token/refresh')) {
        refreshCalls += 1
        await Promise.resolve()
        return jsonResponse({ accessToken: 'new-access', tokenType: 'Bearer', expiresIn: 900 })
      }
      const authorization = new Headers(init?.headers).get('Authorization')
      return authorization === 'Bearer new-access'
        ? jsonResponse({ ok: true })
        : jsonResponse({ error: { code: 'ACCESS_TOKEN_EXPIRED' } }, 401)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { authorizedFetch, login } = await import('./members')
    await login('member@example.com', 'password123')

    const responses = await Promise.all([
      authorizedFetch('/protected/one'),
      authorizedFetch('/protected/two'),
    ])

    expect(responses.every((response) => response.ok)).toBe(true)
    expect(refreshCalls).toBe(1)
  })

  it('clears memory after refresh failure without writing browser storage', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: 'REFRESH_TOKEN_INVALID' } }, 401)),
    )
    const { restoreSession, session } = await import('./members')

    expect(await restoreSession()).toBeNull()
    expect(session.token).toBeNull()
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('notifies the app when a protected request cannot refresh', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/login')) {
        return jsonResponse({ accessToken: 'expired-access', tokenType: 'Bearer', expiresIn: 1 })
      }
      if (url.endsWith('/me')) {
        return jsonResponse({
          id: 1,
          email: 'member@example.com',
          displayName: '회원',
          role: 'USER',
        })
      }
      return url.endsWith('/token/refresh')
        ? jsonResponse({ error: { code: 'REFRESH_TOKEN_EXPIRED' } }, 401)
        : jsonResponse({ error: { code: 'ACCESS_TOKEN_EXPIRED' } }, 401)
    })
    vi.stubGlobal('fetch', fetchMock)
    const { authorizedFetch, login, session } = await import('./members')
    const listener = vi.fn()
    session.subscribe(listener)
    await login('member@example.com', 'password123')

    const response = await authorizedFetch('/protected')

    expect(response.status).toBe(401)
    expect(session.token).toBeNull()
    expect(listener).toHaveBeenCalledWith('expired')
  })

  it('expires the session when a retried request still rejects the refreshed token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/login') || url.endsWith('/token/refresh'))
          return jsonResponse({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 })
        if (url.endsWith('/me'))
          return jsonResponse({
            id: 1,
            email: 'member@example.com',
            displayName: '회원',
            role: 'USER',
          })
        return jsonResponse({ error: { code: 'ACCESS_TOKEN_INVALID' } }, 401)
      }),
    )
    const { login, authorizedFetch, session } = await import('./members')
    await login('member@example.com', 'password123')
    const listener = vi.fn()
    session.subscribe(listener)
    expect((await authorizedFetch('/protected')).status).toBe(401)
    expect(session.token).toBeNull()
    expect(listener).toHaveBeenCalledWith('expired')
  })

  it('does not keep an access token after the member lookup fails during login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/login')
          ? jsonResponse({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 })
          : jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500),
      ),
    )
    const { login, session } = await import('./members')
    await expect(login('member@example.com', 'password123')).rejects.toMatchObject({ status: 500 })
    expect(session.token).toBeNull()
  })
})
