export type AuthField = 'displayName' | 'email' | 'password' | 'confirmPassword'
export type AuthErrors = Partial<Record<AuthField, string>>

export function validateAuth(
  values: { email: string; password: string; displayName: string; confirmPassword: string },
  isSignup: boolean,
): AuthErrors {
  const errors: AuthErrors = {}
  const email = values.email.trim()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = '올바른 이메일 주소를 입력해주세요.'
  if (!values.password) errors.password = '비밀번호를 입력해주세요.'
  else if (new TextEncoder().encode(values.password).length > 72)
    errors.password = '비밀번호는 72바이트 이하로 입력해주세요. 한글은 한 글자당 3바이트예요.'
  else if (isSignup && values.password.length < 8)
    errors.password = '비밀번호는 8자 이상 입력해주세요.'
  if (isSignup) {
    if (!values.displayName.trim() || values.displayName.trim().length > 80)
      errors.displayName = '이름은 공백을 제외해 1~80자로 입력해주세요.'
    if (!values.confirmPassword) errors.confirmPassword = '비밀번호를 한 번 더 입력해주세요.'
    else if (values.password !== values.confirmPassword)
      errors.confirmPassword = '비밀번호가 일치하지 않아요.'
  }
  return errors
}
