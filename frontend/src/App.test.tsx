import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { session } from './api/members'
import App from './App'
import { server } from './test/server'

describe('App authentication lifecycle', () => {
  beforeEach(() => {
    session.clear()
  })

  it('does not authenticate from a Google success query without a valid server session', async () => {
    window.history.replaceState(null, '', '/?oauth=success')
    server.use(
      http.post('/api/members/token/refresh', () =>
        HttpResponse.json({ error: { code: 'REFRESH_TOKEN_INVALID' } }, { status: 401 }),
      ),
    )
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 정보를 확인하지 못했어요.')
    expect(session.token).toBeNull()
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('explains a Google email collision and keeps the existing email login available', async () => {
    window.history.replaceState(null, '', '/?oauth=email_conflict')
    server.use(
      http.post('/api/members/token/refresh', () =>
        HttpResponse.json({ error: { code: 'REFRESH_TOKEN_INVALID' } }, { status: 401 }),
      ),
    )
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 이메일로 가입한 계정이에요.')
    expect(screen.getByLabelText('이메일')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('restores the member from a refresh cookie and calls logout on the server', async () => {
    let logoutCalls = 0
    server.use(
      http.post('/api/members/token/refresh', () =>
        HttpResponse.json({
          accessToken: 'restored-access',
          tokenType: 'Bearer',
          expiresIn: 900,
        }),
      ),
      http.get('/api/members/me', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe('Bearer restored-access')
        return HttpResponse.json({
          id: 1,
          email: 'member@example.com',
          displayName: '회원',
          role: 'USER',
        })
      }),
      http.post('/api/members/logout', () => {
        logoutCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<App />)

    expect(await screen.findByText('회원님')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    await waitFor(() => expect(logoutCalls).toBe(1))
    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(session.token).toBeNull()
  })

  it('keeps a guest on the landing page when no refresh cookie exists', async () => {
    server.use(
      http.post('/api/members/token/refresh', () =>
        HttpResponse.json(
          {
            error: { code: 'REFRESH_TOKEN_INVALID', message: '로그인이 필요합니다.' },
          },
          { status: 401 },
        ),
      ),
    )

    render(<App />)

    expect(await screen.findByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '이 옷, 어디서 팔지?' }),
    ).toBeInTheDocument()
  })
})
