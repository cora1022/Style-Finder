import { useState } from 'react'
import { CropIcon } from '@phosphor-icons/react'
import { ManualCropper } from './ManualCropper'
import { ImagePicker } from './Ui'
import type { CropBox } from '../api/search'

type Props = {
  sourceImageUrl: string | null
  previewImageUrl: string | null
  cropMode: 'auto' | 'manual'
  uploadRevealKey: number
  autoCropMeta: {
    cropApplied: boolean
    cropBox: CropBox | null
    originalSize: string | null
    cropSize: string | null
    detector: string | null
  } | null
  canSearch: boolean
  isLoading: boolean
  isCropping: boolean
  errorMessage: string | null
  onFileSelect: (file: File) => void | Promise<void>
  onCropModeChange: (mode: 'auto' | 'manual') => void
  onAutoCrop: () => void
  onApplyManualCrop: (file: File, previewUrl: string) => void
  onError: (message: string) => void
  onSearch: () => void
}
export function UploadPanel({
  sourceImageUrl,
  previewImageUrl,
  cropMode,
  autoCropMeta,
  canSearch,
  isLoading,
  isCropping,
  errorMessage,
  onFileSelect,
  onCropModeChange,
  onAutoCrop,
  onApplyManualCrop,
  onError,
  onSearch,
}: Props) {
  const [previewBox, setPreviewBox] = useState<CropBox>({ x: 10, y: 8, width: 80, height: 84 })
  const [ratio, setRatio] = useState(1)
  const [appliedBox, setAppliedBox] = useState('')
  if (!sourceImageUrl)
    return (
      <section className="workspace-upload">
        <ImagePicker onSelect={(file) => void onFileSelect(file)} />
        {errorMessage && (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}
      </section>
    )
  const manual = cropMode === 'manual'
  const selectionApplied = canSearch && (!manual || appliedBox === JSON.stringify(previewBox))
  return (
    <section className="crop-workspace" aria-label="검색할 의류 영역 선택">
      <div className="crop-original">
        <div className="section-heading">
          <h2>업로드한 사진</h2>
          <ImagePicker
            compact
            disabled={isCropping || isLoading}
            onSelect={(file) => void onFileSelect(file)}
          />
        </div>
        {manual ? (
          <ManualCropper
            key={sourceImageUrl}
            imageUrl={sourceImageUrl}
            onApplyCrop={(file, url) => {
              setAppliedBox(JSON.stringify(previewBox))
              onApplyManualCrop(file, url)
            }}
            onError={onError}
            onPreviewChange={setPreviewBox}
          />
        ) : (
          <div className="crop-photo-surface">
            <img className="original-photo" src={sourceImageUrl} alt="자동 영역 선택 원본 사진" />
          </div>
        )}
      </div>
      <aside className="crop-sidebar">
        <div className="segmented-control" aria-label="영역 선택 방식">
          <button
            type="button"
            className={!manual ? 'is-active' : ''}
            aria-pressed={!manual}
            onClick={() => onCropModeChange('auto')}
            disabled={isCropping || isLoading}
          >
            자동 선택
          </button>
          <button
            type="button"
            className={manual ? 'is-active' : ''}
            aria-pressed={manual}
            onClick={() => onCropModeChange('manual')}
            disabled={isCropping || isLoading}
          >
            직접 선택
          </button>
        </div>
        <h2>선택한 영역</h2>
        {manual && !selectionApplied ? (
          <div className="selection-preview manual">
            <div
              className="selection-crop-window"
              style={{
                width:
                  'min(100%, calc(var(--preview-height) * ' +
                  (ratio * previewBox.width) / previewBox.height +
                  '))',
                aspectRatio: (ratio * previewBox.width) / previewBox.height,
              }}
            >
              <img
                src={sourceImageUrl}
                alt="선택한 영역 미리보기"
                onLoad={(event) =>
                  setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)
                }
                style={{
                  width: 10000 / previewBox.width + '%',
                  height: 10000 / previewBox.height + '%',
                  left: (-previewBox.x / previewBox.width) * 100 + '%',
                  top: (-previewBox.y / previewBox.height) * 100 + '%',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="selection-preview ready">
            <img src={previewImageUrl || sourceImageUrl} alt="검색에 사용할 영역 미리보기" />
          </div>
        )}
        <p className="muted crop-helper">
          {selectionApplied
            ? '이 영역을 기준으로 비슷한 옷을 찾아요.'
            : manual
              ? '테두리를 움직인 뒤 선택 영역을 적용해주세요.'
              : '자동으로 옷 영역을 찾아 미리보기를 만들어요.'}
        </p>
        {!manual && (
          <button
            className="outline-button auto-crop-button"
            type="button"
            onClick={onAutoCrop}
            disabled={isCropping || isLoading}
          >
            <CropIcon />
            {isCropping ? '영역을 찾고 있어요...' : '자동으로 영역 찾기'}
          </button>
        )}
        {autoCropMeta && !autoCropMeta.cropApplied && !manual && (
          <p className="hint-message">
            옷 영역이 뚜렷하지 않아 전체 사진을 선택했어요. 직접 선택으로 조절할 수 있어요.
          </p>
        )}
        {errorMessage && (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        )}
        <button
          className="primary-button search-button"
          type="button"
          onClick={onSearch}
          disabled={!selectionApplied || isLoading || isCropping}
        >
          {isLoading ? '검색 중...' : '이 영역으로 검색하기'}
        </button>
        {canSearch && (
          <button className="text-button reset-crop" onClick={() => onCropModeChange(cropMode)}>
            영역 다시 맞추기
          </button>
        )}
      </aside>
    </section>
  )
}
