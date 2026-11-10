import { ImageIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'

export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="brand" type="button" onClick={onClick} aria-label="Style Finder 홈">
      style finder
    </button>
  )
}

export function AppHeader({ onHome, onMyPage }: { onHome: () => void; onMyPage?: () => void }) {
  return (
    <header className="app-header">
      <Brand onClick={onHome} />
      <nav aria-label="페이지 메뉴">
        {onMyPage && (
          <button className="text-button" onClick={onMyPage}>
            마이페이지
          </button>
        )}
        <button className="outline-button small" onClick={onHome}>
          메인으로
        </button>
      </nav>
    </header>
  )
}

const steps = ['사진 업로드', '영역 확인', '검색 결과']
export function SearchSteps({
  current,
  onChange,
}: {
  current: number
  onChange?: (step: number) => void
}) {
  return (
    <nav className="search-steps" aria-label="검색 단계">
      {steps.map((name, index) => (
        <button
          key={name}
          type="button"
          className={current === index ? 'current' : ''}
          aria-current={current === index ? 'step' : undefined}
          disabled={!onChange || index > current}
          onClick={() => onChange?.(index)}
        >
          <span>{index + 1}</span>
          {name}
        </button>
      ))}
    </nav>
  )
}

export function ImagePicker({
  onSelect,
  compact = false,
  disabled = false,
}: {
  onSelect: (file: File) => void
  compact?: boolean
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onSelect(file)
    event.target.value = ''
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled && event.dataTransfer.files[0]) onSelect(event.dataTransfer.files[0])
  }
  return (
    <div className={compact ? 'compact-picker' : 'upload-card'}>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png"
        aria-label="옷 사진 파일 선택"
        onChange={choose}
        disabled={disabled}
      />
      {compact ? (
        <button
          className="outline-button small"
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled}
        >
          다른 사진 선택
        </button>
      ) : (
        <div
          className={'upload-target' + (dragging ? ' is-dragging' : '')}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
          }}
          onDrop={drop}
        >
          <div className="upload-icon" aria-hidden="true">
            <ImageIcon weight="light" />
            <UploadSimpleIcon className="upload-icon-badge" />
          </div>
          <h2>여기에 이미지를 놓아주세요</h2>
          <button
            type="button"
            className="primary-button"
            onClick={() => input.current?.click()}
            disabled={disabled}
          >
            사진 선택하기
          </button>
          <p>JPG, PNG 파일 (최대 10MB)</p>
        </div>
      )}
    </div>
  )
}
