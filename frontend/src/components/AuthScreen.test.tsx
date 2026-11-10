import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { AuthScreen } from './AuthScreen'
import { server } from '../test/server'

function fillSignup(password = 'portfolio123', confirmation = password) {
  fireEvent.change(screen.getByLabelText('이름'), { target: { value: ' 포트폴리오 ' } })
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'member@example.com' } })
  fireEvent.change(screen.getByLabelText('비밀번호', { exact: true }), {
    target: { value: password },
  })
  fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: confirmation } })
}

describe('authentication form', () => {
  it('enables Google login only when the server reports it configured', async () => {
    server.use(http.get('/api/members/oauth2/status', () => HttpResponse.json({ enabled: true })))
    render(<AuthScreen initialMode="login" onClose={vi.fn()} onDone={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeEnabled(),
    )
    expect(
      screen.queryByText('Google 로그인은 준비 중이에요. 이메일로 시작해주세요.'),
    ).not.toBeInTheDocument()
  })
  it('blocks mismatched and multibyte overlong passwords before sending a request', () => {
    render(<AuthScreen initialMode="signup" onClose={vi.fn()} onDone={vi.fn()} />)
    fillSignup('portfolio123', 'different123')
    fireEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    expect(screen.getByLabelText('비밀번호 확인')).toHaveFocus()
    expect(screen.getByText('비밀번호가 일치하지 않아요.')).toBeInTheDocument()
    fillSignup('가'.repeat(25))
    fireEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    expect(screen.getByLabelText('비밀번호', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByText(/한글은 한 글자당 3바이트/)).toBeInTheDocument()
  })

  it('normalizes signup fields, clears secrets and presents a successful login step', async () => {
    let payload: unknown
    server.use(
      http.post('/api/members/signup', async ({ request }) => {
        payload = await request.json()
        return HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    render(<AuthScreen initialMode="signup" onClose={vi.fn()} onDone={vi.fn()} />)
    fillSignup()
    fireEvent.click(screen.getByRole('button', { name: '계정 만들기' }))
    expect(await screen.findByRole('status')).toHaveTextContent('가입이 완료됐어요.')
    expect(payload).toEqual({
      email: 'member@example.com',
      password: 'portfolio123',
      displayName: '포트폴리오',
    })
    expect(screen.getByLabelText('비밀번호', { exact: true })).toHaveValue('')
    expect(screen.queryByLabelText('비밀번호 확인')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google로 계속하기' })).toBeDisabled()
  })

  it('prevents duplicate submissions and shows the duplicate email beside its field', async () => {
    let calls = 0
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    server.use(
      http.post('/api/members/signup', async () => {
        calls += 1
        await pending
        return HttpResponse.json({ error: { code: 'EMAIL_ALREADY_EXISTS' } }, { status: 409 })
      }),
    )
    render(<AuthScreen initialMode="signup" onClose={vi.fn()} onDone={vi.fn()} />)
    fillSignup()
    const form = screen.getByRole('button', { name: '계정 만들기' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    await waitFor(() => expect(calls).toBe(1))
    expect(screen.getByRole('button', { name: '로그인 창 닫기' })).toBeDisabled()
    finish()
    expect(await screen.findByText('이미 가입된 이메일이에요. 로그인해주세요.')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-invalid', 'true')
  })
})
