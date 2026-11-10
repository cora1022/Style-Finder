import { MagnifyingGlassIcon } from '@phosphor-icons/react'
type Props = { isVisible: boolean }
export function SearchLoadingOverlay({ isVisible }: Props) {
  if (!isVisible) return null
  return (
    <div className="search-loading-overlay" role="status" aria-live="polite">
      <section className="search-loading-card">
        <MagnifyingGlassIcon
          className="search-loading-glass"
          size={44}
          weight="light"
          aria-hidden="true"
        />
        <h2>사진 속 옷을 살펴보고 있어요.</h2>
        <p>형태와 색상을 비교하고 있어요. 잠시만 기다려주세요.</p>
        <div className="loading-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </div>
  )
}
