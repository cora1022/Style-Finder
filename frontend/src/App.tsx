import { useEffect, useState } from 'react'
import './styles/search.css'
import './styles/landing.css'
import './styles/auth.css'
import './styles/mypage.css'
import { IntroScreen } from './components/IntroScreen'
import { SearchScreen } from './components/SearchScreen'
import { AuthScreen } from './components/AuthScreen'
import { MyPage } from './components/MyPage'
import { logout, restoreSession, session, type Member } from './api/members'

type Screen = 'intro' | 'search' | 'mypage'
type AuthMode = 'login' | 'signup'

function App() {
  const [oauthResult] = useState(() => new URLSearchParams(window.location.search).get('oauth'))
  const [authNotice, setAuthNotice] = useState(
    oauthResult === 'email_conflict'
      ? '이미 이메일로 가입한 계정이에요. 기존 이메일과 비밀번호로 로그인해주세요.'
      : oauthResult === 'failed'
        ? 'Google 로그인을 완료하지 못했어요. 다시 시도해주세요.'
        : '',
  )
  const [screen, setScreen] = useState<Screen>('intro')
  const [member, setMember] = useState<Member | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode | null>(authNotice ? 'login' : null)
  const [continueToSearch, setContinueToSearch] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [initialCatalogItemId, setInitialCatalogItemId] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  useEffect(() => {
    let active = true
    if (oauthResult) {
      const url = new URL(window.location.href)
      url.searchParams.delete('oauth')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    }
    restoreSession()
      .then((restoredMember) => {
        if (!active) return
        setMember(restoredMember)
        if (oauthResult === 'success' && !restoredMember) {
          setAuthNotice('로그인 정보를 확인하지 못했어요. Google 로그인을 다시 시도해주세요.')
          setAuthMode('login')
        }
      })
      .finally(() => {
        if (active) setIsRestoringSession(false)
      })
    return () => {
      active = false
    }
  }, [oauthResult])

  useEffect(
    () =>
      session.subscribe((reason) => {
        setMember(null)
        setScreen('intro')
        if (reason === 'expired') setAuthMode('login')
      }),
    [],
  )

  const startSearch = (file?: File) => {
    if (isRestoringSession) return
    setPendingFile(file ?? null)
    if (member) {
      setScreen('search')
      return
    }
    setContinueToSearch(true)
    setAuthMode('login')
  }

  const screenNode =
    screen === 'intro' ? (
      <IntroScreen
        member={member}
        onStart={startSearch}
        onLogin={() => {
          setContinueToSearch(false)
          setAuthMode('login')
        }}
        onSignup={() => {
          setContinueToSearch(false)
          setAuthMode('signup')
        }}
        onMyPage={() => setScreen('mypage')}
        onLogout={async () => {
          try {
            await logout()
          } finally {
            setMember(null)
            setScreen('intro')
          }
        }}
      />
    ) : screen === 'search' ? (
      <SearchScreen
        initialFile={pendingFile}
        onBack={() => setScreen('intro')}
        onMyPage={() => setScreen('mypage')}
        initialCatalogItemId={initialCatalogItemId}
        onInitialCatalogConsumed={() => setInitialCatalogItemId(null)}
      />
    ) : member ? (
      <MyPage
        member={member}
        onBack={() => setScreen('intro')}
        onSearchSaved={(catalogItemId) => {
          setPendingFile(null)
          setInitialCatalogItemId(catalogItemId)
          setScreen('search')
        }}
      />
    ) : (
      <IntroScreen
        member={null}
        onStart={startSearch}
        onLogin={() => setAuthMode('login')}
        onSignup={() => setAuthMode('signup')}
        onMyPage={() => setAuthMode('login')}
        onLogout={() => undefined}
      />
    )

  return (
    <>
      {screenNode}
      {authMode && (
        <AuthScreen
          initialMessage={authNotice}
          initialMode={authMode}
          onClose={() => {
            setAuthNotice('')
            setAuthMode(null)
            setContinueToSearch(false)
          }}
          onDone={(user) => {
            setAuthNotice('')
            setMember(user)
            setAuthMode(null)
            if (continueToSearch) setScreen('search')
            setContinueToSearch(false)
          }}
        />
      )}
    </>
  )
}

export default App
