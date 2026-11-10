import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CheckCircleIcon, EyeIcon, EyeSlashIcon, XIcon } from '@phosphor-icons/react'
import { login, MemberApiError, memberErrorMessage, signup, type Member } from '../api/members'
import { validateAuth, type AuthErrors, type AuthField } from '../utils/authValidation'
type Props = {
  initialMode: 'login' | 'signup'
  initialMessage?: string
  onClose: () => void
  onDone: (member: Member) => void
}
export function AuthScreen({ initialMode, initialMessage = '', onClose, onDone }: Props) {
  const [isSignup, setIsSignup] = useState(initialMode === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<AuthErrors>({})
  const [capsLock, setCapsLock] = useState(false)
  const [messageKind, setMessageKind] = useState<'error' | 'success'>('error')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState(initialMessage)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const submitting = useRef(false)
  const mounted = useRef(false)
  const [googleConfigured, setGoogleConfigured] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/members/oauth2/status', { signal: controller.signal })
      .then(async (response) => response.ok && (await response.json()).enabled === true)
      .then((enabled) => {
        if (!controller.signal.aborted) setGoogleConfigured(enabled)
      })
      .catch(() => {
        if (!controller.signal.aborted) setGoogleConfigured(false)
      })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    mounted.current = true
    const element = dialog.current
    const previous = document.activeElement as HTMLElement | null
    element?.showModal()
    element?.querySelector<HTMLInputElement>('input')?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      mounted.current = false
      element?.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  const changeMode = (signupMode: boolean) => {
    if (submitting.current) return
    setIsSignup(signupMode)
    setMessage('')
    setErrors({})
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setCapsLock(false)
  }
  const clearError = (field: AuthField) => {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage('')
  }
  const fieldError = (field: AuthField) =>
    errors[field] ? (
      <span className="auth-field-error" id={'auth-error-' + field}>
        {errors[field]}
      </span>
    ) : null
  const focusError = (nextErrors: AuthErrors) => {
    const field = (['displayName', 'email', 'password', 'confirmPassword'] as const).find(
      (name) => nextErrors[name],
    )
    if (field) dialog.current?.querySelector<HTMLInputElement>('[name="' + field + '"]')?.focus()
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting.current) return
    const nextErrors = validateAuth({ email, password, displayName, confirmPassword }, isSignup)
    setErrors(nextErrors)
    setMessage('')
    setMessageKind('error')
    if (Object.keys(nextErrors).length) {
      focusError(nextErrors)
      return
    }
    submitting.current = true
    setIsSubmitting(true)
    try {
      if (isSignup) {
        await signup(email.trim(), password, displayName.trim())
        if (!mounted.current) return
        setIsSignup(false)
        setPassword('')
        setConfirmPassword('')
        setShowPassword(false)
        setMessageKind('success')
        setMessage('가입이 완료됐어요. 방금 만든 계정으로 로그인해주세요.')
        requestAnimationFrame(() => {
          if (mounted.current)
            dialog.current?.querySelector<HTMLInputElement>('[name="password"]')?.focus()
        })
      } else {
        const member = await login(email.trim(), password)
        if (mounted.current) onDone(member)
      }
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof MemberApiError) {
        const serverErrors: AuthErrors = {}
        for (const field of ['displayName', 'email', 'password'] as const)
          if (error.fields[field]) serverErrors[field] = error.fields[field]
        if (error.code === 'EMAIL_ALREADY_EXISTS')
          serverErrors.email = '이미 가입된 이메일이에요. 로그인해주세요.'
        if (error.code === 'PASSWORD_TOO_LONG')
          serverErrors.password = '비밀번호는 72바이트 이하로 입력해주세요.'
        setErrors(serverErrors)
        requestAnimationFrame(() => {
          if (mounted.current) focusError(serverErrors)
        })
      }
      setMessage(
        error instanceof TypeError
          ? '네트워크 연결을 확인하고 다시 시도해주세요.'
          : memberErrorMessage(
              error,
              isSignup
                ? '입력한 회원 정보를 확인해주세요.'
                : '이메일 또는 비밀번호를 확인해주세요.',
            ),
      )
    } finally {
      submitting.current = false
      if (mounted.current) setIsSubmitting(false)
    }
  }
  const googleLogin = () => {
    const url = import.meta.env.VITE_GOOGLE_LOGIN_URL || '/api/members/oauth2/authorization/google'
    if (!googleConfigured) {
      setMessageKind('error')
      setMessage('Google 로그인은 준비 중이에요. 이메일로 로그인해주세요.')
      return
    }
    setMessageKind('error')
    try {
      const target = new URL(url, window.location.origin)
      if (target.origin !== window.location.origin) throw new Error('Invalid login origin')
      window.location.assign(target.href)
    } catch {
      setMessage('Google 로그인에 연결하지 못했어요. 이메일로 로그인해주세요.')
    }
  }
  return (
    <dialog
      className="auth-dialog"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault()
        if (!submitting.current) onClose()
      }}
      aria-labelledby="auth-title"
    >
      <section className="auth-screen">
        <button
          className="icon-button auth-close"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="로그인 창 닫기"
        >
          <XIcon size={25} />
        </button>
        <h1 id="auth-title">{isSignup ? '회원가입' : '로그인'}</h1>
        <p className="auth-description">
          {isSignup
            ? '마음에 드는 검색 결과를 모아보세요.'
            : '찾아둔 옷과 검색 기록을 이어서 만나보세요.'}
        </p>
        <button
          className="google-login"
          onClick={googleLogin}
          disabled={isSubmitting || !googleConfigured}
          aria-describedby={!googleConfigured ? 'google-login-status' : undefined}
        >
          <img src="/assets/google-g.png" alt="" width="24" height="24" />
          Google로 계속하기
        </button>
        {!googleConfigured && (
          <p className="auth-provider-note" id="google-login-status">
            Google 로그인은 준비 중이에요. 이메일로 시작해주세요.
          </p>
        )}
        <div className="auth-divider">
          <span>또는 이메일로 {isSignup ? '가입하기' : '로그인'}</span>
        </div>
        <div className="segmented-control" aria-label="회원 메뉴">
          {['로그인', '회원가입'].map((name, index) => (
            <button
              key={name}
              className={isSignup === Boolean(index) ? 'is-active' : ''}
              type="button"
              disabled={isSubmitting}
              onClick={() => changeMode(Boolean(index))}
              aria-pressed={isSignup === Boolean(index)}
            >
              {name}
            </button>
          ))}
        </div>
        <form onSubmit={submit} noValidate aria-busy={isSubmitting}>
          <fieldset disabled={isSubmitting} className="auth-fields">
            {isSignup && (
              <div className="auth-field">
                <label htmlFor="auth-displayName">이름</label>
                <input
                  id="auth-displayName"
                  name="displayName"
                  aria-invalid={Boolean(errors.displayName)}
                  aria-describedby={errors.displayName ? 'auth-error-displayName' : undefined}
                  required
                  maxLength={80}
                  autoComplete="nickname"
                  placeholder="표시할 이름"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value)
                    clearError('displayName')
                  }}
                />
                {fieldError('displayName')}
              </div>
            )}
            <div className="auth-field">
              <label htmlFor="auth-email">이메일</label>
              <input
                id="auth-email"
                name="email"
                maxLength={254}
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'auth-error-email' : undefined}
                type="email"
                required
                autoComplete="email"
                placeholder="이메일 주소 입력"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  clearError('email')
                }}
              />
              {fieldError('email')}
            </div>
            <div className="auth-field">
              <label htmlFor="auth-password">비밀번호</label>
              <div className="password-field">
                <input
                  id="auth-password"
                  name="password"
                  maxLength={72}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    'auth-password-hint' +
                    (errors.password ? ' auth-error-password' : '') +
                    (capsLock ? ' auth-caps-lock' : '')
                  }
                  type={showPassword ? 'text' : 'password'}
                  aria-label="비밀번호"
                  required
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder={isSignup ? '8자 이상 입력' : '비밀번호 입력'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    clearError('password')
                    clearError('confirmPassword')
                  }}
                  onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                  onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
                  onBlur={() => setCapsLock(false)}
                />
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                </button>
              </div>
              <p className="auth-field-hint" id="auth-password-hint">
                {isSignup
                  ? '8자 이상, 최대 72바이트. 다른 서비스와 다른 비밀번호를 사용해주세요.'
                  : '가입할 때 사용한 비밀번호를 입력해주세요.'}
              </p>
              {capsLock && (
                <p className="auth-field-hint" id="auth-caps-lock" role="status">
                  Caps Lock이 켜져 있어요.
                </p>
              )}
              {fieldError('password')}
            </div>
            {isSignup && (
              <div className="auth-field">
                <label htmlFor="auth-confirmPassword">비밀번호 확인</label>
                <input
                  id="auth-confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  maxLength={72}
                  value={confirmPassword}
                  placeholder="비밀번호를 한 번 더 입력"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={
                    errors.confirmPassword ? 'auth-error-confirmPassword' : undefined
                  }
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    clearError('confirmPassword')
                  }}
                />
                {fieldError('confirmPassword')}
                {confirmPassword && confirmPassword === password && (
                  <span className="auth-password-match">
                    <CheckCircleIcon aria-hidden="true" />
                    비밀번호가 일치해요.
                  </span>
                )}
              </div>
            )}
          </fieldset>
          {message && (
            <p
              className={'auth-message ' + messageKind}
              role={messageKind === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          )}
          <button className="primary-button auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '처리 중...' : isSignup ? '계정 만들기' : '로그인'}
          </button>
        </form>
      </section>
    </dialog>
  )
}
