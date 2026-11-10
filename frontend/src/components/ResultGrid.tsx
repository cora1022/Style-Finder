import { ArrowUpRightIcon, BookmarkSimpleIcon, CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import type { SearchResult } from '../api/search'
import { productLink } from '../utils/productLink'
const priceFormatter = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' })
type Props = {
  results: SearchResult[]
  isLoading: boolean
  isLoadingMore: boolean
  revealKey: number
  newResultIds?: string[]
  saveStates: Record<string, 'saving' | 'saved' | 'duplicate' | 'error'>
  onFindMore: () => void
  onFindSimilarResult: (item: SearchResult) => void
  onSaveResult: (item: SearchResult) => void
}
export function ResultGrid({
  results,
  isLoading,
  isLoadingMore,
  revealKey,
  newResultIds = [],
  saveStates,
  onFindMore,
  onFindSimilarResult,
  onSaveResult,
}: Props) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (isLoadingMore || !newResultIds.length) return
    let timeout: number | undefined
    let newRows: HTMLElement[] = []
    const frame = requestAnimationFrame(() => {
      newRows = Array.from(
        list.current?.querySelectorAll<HTMLElement>('[data-result-id]') ?? [],
      ).filter((element) => newResultIds.includes(element.dataset.resultId ?? ''))
      newRows.forEach((element) => element.classList.add('result-pop'))
      newRows[0]?.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'center',
      })
      timeout = window.setTimeout(() => {
        newRows.forEach((element) => element.classList.remove('result-pop'))
      }, 800)
    })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      newRows.forEach((element) => element.classList.remove('result-pop'))
    }
  }, [revealKey, isLoadingMore, newResultIds])
  return (
    <section
      className="result-panel"
      aria-labelledby="result-title"
      aria-busy={isLoading || isLoadingMore}
    >
      <div className="section-heading result-heading">
        <h2 id="result-title">검색 결과 {results.length}개</h2>
        <span className="muted">유사도 순</span>
      </div>
      {isLoading && !results.length ? (
        <div className="empty-state">비슷한 옷을 찾고 있어요.</div>
      ) : !results.length ? (
        <div className="empty-state">아직 결과가 없어요. 다른 사진이나 영역으로 검색해보세요.</div>
      ) : (
        <>
          <div className="result-list" ref={list}>
            {results.map((item) => {
              const url = productLink(item.sourceUrl)
              const state = saveStates[item.catalogItemId]
              const saved = state === 'saved' || state === 'duplicate'
              return (
                <article
                  className="result-row"
                  data-result-id={item.catalogItemId}
                  key={item.catalogItemId}
                >
                  <img
                    className="result-image"
                    src={item.imageUrl}
                    alt={item.title}
                    loading="lazy"
                    width="180"
                    height="180"
                  />
                  <div className="result-info">
                    <p className="store-name">
                      {item.metadata.storeName || item.metadata.category}
                    </p>
                    <h3>{item.title}</h3>
                    {item.metadata.price != null && (
                      <p className="result-price">{priceFormatter.format(item.metadata.price)}</p>
                    )}
                    <button
                      className="inline-link similar-link"
                      onClick={() => onFindSimilarResult(item)}
                      disabled={isLoading || isLoadingMore}
                    >
                      비슷한 결과 찾기
                    </button>
                  </div>
                  <div className="result-match">
                    <p>
                      유사도 <strong>{(item.similarityScore * 100).toFixed(1)}%</strong>
                    </p>
                    {url ? (
                      <a
                        className="primary-button product-link"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        상품 보러 가기
                        <ArrowUpRightIcon aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="muted">로컬 카탈로그</span>
                    )}
                  </div>
                  <button
                    className={'icon-button bookmark-button' + (saved ? ' saved' : '')}
                    type="button"
                    aria-label={
                      saved
                        ? item.title + ' 저장됨'
                        : state === 'error'
                          ? item.title + ' 다시 저장'
                          : item.title + ' 저장'
                    }
                    title={saved ? '저장됨' : '저장'}
                    disabled={state === 'saving' || saved}
                    aria-pressed={saved}
                    onClick={() => onSaveResult(item)}
                  >
                    {saved ? <CheckIcon /> : <BookmarkSimpleIcon />}
                  </button>
                </article>
              )
            })}
          </div>
          <div className="more-results">
            <button
              className="outline-button"
              onClick={onFindMore}
              disabled={isLoadingMore || isLoading || results.length >= 20}
            >
              {isLoadingMore
                ? '더 찾고 있어요...'
                : results.length >= 20
                  ? '모든 결과를 확인했어요'
                  : '다음 2개 더 찾기'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
