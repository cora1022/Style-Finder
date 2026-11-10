import { useCallback, useEffect, useState } from 'react'
import {
  deleteSavedResult,
  deleteSearchHistory,
  listSavedResults,
  listSearchHistories,
  type PageResponse,
  type SavedResult,
  type SearchHistory,
} from '../api/activity'
import type { Member } from '../api/members'
import { AppHeader } from './Ui'

type Props = {
  member: Member
  onBack: () => void
  onSearchSaved: (catalogItemId: string) => void
}

const emptyHistoryPage: PageResponse<SearchHistory> = {
  items: [], page: 0, size: 10, totalElements: 0, totalPages: 0,
}
const emptySavedPage: PageResponse<SavedResult> = {
  items: [], page: 0, size: 8, totalElements: 0, totalPages: 0,
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function MyPage({ member, onBack, onSearchSaved }: Props) {
  const [historyPage, setHistoryPage] = useState(emptyHistoryPage)
  const [savedPage, setSavedPage] = useState(emptySavedPage)
  const [historyIndex, setHistoryIndex] = useState(0)
  const [savedIndex, setSavedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  const fetchPages = useCallback(() => {
    return Promise.all([
      listSearchHistories(historyIndex),
      listSavedResults(savedIndex),
    ])
  }, [historyIndex, savedIndex])

  useEffect(() => {
    let active = true
    fetchPages()
      .then(([histories, saved]) => {
        if (!active) return
        setHistoryPage(histories)
        setSavedPage(saved)
        setMessage(null)
      })
      .catch((error) => {
        if (active) setMessage(error instanceof Error ? error.message : '마이페이지를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchPages])

  const reload = async () => {
    setIsLoading(true)
    try {
      const [histories, saved] = await fetchPages()
      setHistoryPage(histories)
      setSavedPage(saved)
    } finally {
      setIsLoading(false)
    }
  }

  const removeHistory = async (id: number) => {
    try {
      await deleteSearchHistory(id)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '검색 기록을 삭제하지 못했습니다.')
    }
  }

  const removeSaved = async (id: number) => {
    try {
      await deleteSavedResult(id)
      await reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 결과를 삭제하지 못했습니다.')
    }
  }

  return (
    <main className="my-page">
      <AppHeader onHome={onBack} />

      <section className="my-page-heading">
        <p><span>01</span> MEMBER PROFILE</p>
        <div>
          <h1>{member.displayName}님의<br />스타일 기록</h1>
          <p>{member.email}</p>
        </div>
      </section>

      {message && <p className="my-page-message" role="status">{message}</p>}
      {isLoading ? (
        <div className="my-page-loading">기록을 불러오는 중입니다.</div>
      ) : (
        <div className="my-page-content">
          <section className="my-page-section" aria-labelledby="history-title">
            <header>
              <div><span>02</span><h2 id="history-title">검색 기록</h2></div>
              <strong>{historyPage.totalElements}</strong>
            </header>
            {historyPage.items.length === 0 ? (
              <p className="my-page-empty">아직 검색 기록이 없습니다.</p>
            ) : (
              <ul className="history-list">
                {historyPage.items.map((history) => (
                  <li key={history.id}>
                    <div>
                      <strong>{history.searchType === 'IMAGE_UPLOAD' ? '업로드 이미지 검색' : '카탈로그 재검색'}</strong>
                      <span>{history.cropMode === 'AUTO' ? '자동 영역' : history.cropMode === 'MANUAL' ? '수동 영역' : '카탈로그 이미지'}</span>
                    </div>
                    <time dateTime={history.searchedAt}>{formatDate(history.searchedAt)}</time>
                    <button type="button" onClick={() => void removeHistory(history.id)}>삭제</button>
                  </li>
                ))}
              </ul>
            )}
            <PageButtons
              page={historyPage.page}
              totalPages={historyPage.totalPages}
              onChange={setHistoryIndex}
            />
          </section>

          <section className="my-page-section" aria-labelledby="saved-title">
            <header>
              <div><span>03</span><h2 id="saved-title">저장한 이미지</h2></div>
              <strong>{savedPage.totalElements}</strong>
            </header>
            {savedPage.items.length === 0 ? (
              <p className="my-page-empty">아직 저장한 이미지가 없습니다.</p>
            ) : (
              <div className="saved-result-list">
                {savedPage.items.map((item) => (
                  <article key={item.id}>
                    <img src={item.imageUrl} alt={item.title} />
                    <div>
                      <p>{item.metadata.category}</p>
                      <h3>{item.title}</h3>
                      <strong>유사도 {(item.similarityScore * 100).toFixed(1)}%</strong>
                      <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                      <div className="saved-result-actions">
                        <button type="button" onClick={() => onSearchSaved(item.catalogItemId)}>다시 검색</button>
                        <button type="button" onClick={() => void removeSaved(item.id)}>삭제</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <PageButtons
              page={savedPage.page}
              totalPages={savedPage.totalPages}
              onChange={setSavedIndex}
            />
          </section>
        </div>
      )}
    </main>
  )
}

function PageButtons({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="my-page-pagination">
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>이전</button>
      <span>{page + 1} / {totalPages}</span>
      <button type="button" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)}>다음</button>
    </div>
  )
}
