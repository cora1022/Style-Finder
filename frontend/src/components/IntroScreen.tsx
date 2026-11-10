import { useState } from 'react'
import type { Member } from '../api/members'
import { validateImageFile } from '../utils/imageValidation'
import { Brand, ImagePicker } from './Ui'
import { WardrobeBackground } from './WardrobeBackground'
import { HeroTitle } from './HeroTitle'

type Props = {
  member: Member | null
  onStart: (file?: File) => void
  onLogin: () => void
  onSignup: () => void
  onMyPage: () => void
  onLogout: () => void
}
export function IntroScreen({ member, onStart, onLogin, onMyPage, onLogout }: Props) {
  const [error, setError] = useState('')
  const choose = async (file: File) => {
    try {
      await validateImageFile(file)
      setError('')
      onStart(file)
    } catch (error) {
      setError(error instanceof Error ? error.message : '이미지를 확인해주세요.')
    }
  }
  return (
    <main className="fashion-home">
      <WardrobeBackground />
      <header className="app-header">
        <Brand onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
        <nav aria-label="회원 메뉴">
          {member ? (
            <>
              <span className="member-name">{member.displayName}님</span>
              <button className="text-button" onClick={onMyPage}>
                마이페이지
              </button>
              <button className="outline-button small" onClick={onLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <button className="outline-button small" onClick={onLogin}>
              로그인
            </button>
          )}
        </nav>
      </header>
      <section className="home-main" aria-labelledby="home-title">
        <div className="home-hero">
          <div className="hero-copy">
            <p className="eyebrow">SNS에서 본 옷 찾기</p>
            <HeroTitle />
            <p className="hero-description">
              옷 사진을 올리고 궁금한 부분을 골라보세요!
              <br className="desktop-break" />
              비슷한 아이템을 찾아드릴게요
            </p>
          </div>
          <div>
            <ImagePicker onSelect={(file) => void choose(file)} />
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
