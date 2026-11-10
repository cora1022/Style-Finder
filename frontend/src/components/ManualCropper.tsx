import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import type { CropBox } from '../api/search'
type Mode = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type Props = {
  imageUrl: string
  onApplyCrop: (file: File, previewUrl: string) => void
  onError: (message: string) => void
  onPreviewChange?: (box: CropBox) => void
}
const initial: CropBox = { x: 10, y: 8, width: 80, height: 84 }
export function ManualCropper({ imageUrl, onApplyCrop, onError, onPreviewChange }: Props) {
  const [box, setBox] = useState(initial)
  const [ratio, setRatio] = useState(1)
  const stage = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{ mode: Mode; box: CropBox; x: number; y: number } | null>(null)
  useEffect(() => {
    onPreviewChange?.(initial)
  }, [imageUrl, onPreviewChange])
  const update = (next: CropBox) => {
    setBox(next)
    onPreviewChange?.(next)
  }
  const down = (event: PointerEvent<HTMLDivElement | HTMLButtonElement>, mode: Mode) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { mode, box, x: event.clientX, y: event.clientY }
  }
  const move = (event: PointerEvent) => {
    if (!drag.current || !stage.current) return
    const rect = stage.current.getBoundingClientRect()
    const current = drag.current
    const dx = ((event.clientX - current.x) / rect.width) * 100
    const dy = ((event.clientY - current.y) / rect.height) * 100
    if (current.mode === 'move') {
      update({
        ...current.box,
        x: Math.max(0, Math.min(100 - current.box.width, current.box.x + dx)),
        y: Math.max(0, Math.min(100 - current.box.height, current.box.y + dy)),
      })
    } else update(resize(current.box, current.mode, dx, dy))
  }
  const keyboard = (event: KeyboardEvent, mode: Mode) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    if (!delta[event.key]) return
    event.preventDefault()
    const [dx, dy] = delta[event.key]
    if (mode === 'move')
      update({
        ...box,
        x: Math.max(0, Math.min(100 - box.width, box.x + dx)),
        y: Math.max(0, Math.min(100 - box.height, box.y + dy)),
      })
    else update(resize(box, mode, dx, dy))
  }
  const apply = () => {
    if (!image.current?.naturalWidth) {
      onError('이미지를 아직 읽지 못했어요. 잠시 후 다시 시도해주세요.')
      return
    }
    const original = image.current
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((original.naturalWidth * box.width) / 100))
    canvas.height = Math.max(1, Math.round((original.naturalHeight * box.height) / 100))
    const context = canvas.getContext('2d')
    if (!context) {
      onError('이미지를 처리하지 못했어요. 다시 시도해주세요.')
      return
    }
    context.drawImage(
      original,
      (original.naturalWidth * box.x) / 100,
      (original.naturalHeight * box.y) / 100,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          onError('선택 영역을 저장하지 못했어요. 다시 시도해주세요.')
          return
        }
        onApplyCrop(
          new File([blob], 'selected-clothing.jpg', { type: 'image/jpeg' }),
          URL.createObjectURL(blob),
        )
      },
      'image/jpeg',
      0.94,
    )
  }
  return (
    <div className="manual-cropper">
      <div className="crop-photo-surface">
        <div
          className="crop-stage"
          ref={stage}
          style={{ width: 'min(100%, ' + 560 * ratio + 'px)', aspectRatio: ratio }}
        >
          <img
            ref={image}
            src={imageUrl}
            alt="검색할 옷이 있는 원본 사진"
            draggable={false}
            onLoad={(event) =>
              setRatio(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)
            }
          />
          <div
            className="crop-selection"
            role="group"
            tabIndex={0}
            aria-label="검색 영역 이동, 방향키로 조절"
            style={{
              left: box.x + '%',
              top: box.y + '%',
              width: box.width + '%',
              height: box.height + '%',
            }}
            onPointerDown={(event) => down(event, 'move')}
            onPointerMove={move}
            onPointerUp={() => {
              drag.current = null
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
            onKeyDown={(event) => keyboard(event, 'move')}
          >
            {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as Mode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                className={'crop-handle crop-handle-' + mode}
                aria-label={'영역 크기 ' + mode + ' 방향 조절'}
                onPointerDown={(event) => down(event, mode)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  keyboard(event, mode)
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <button className="outline-button small crop-apply-button" type="button" onClick={apply}>
        선택 영역 적용
      </button>
    </div>
  )
}
function resize(box: CropBox, mode: Mode, dx: number, dy: number): CropBox {
  let { x, y } = box
  let right = x + box.width,
    bottom = y + box.height
  if (mode.includes('w')) x = Math.max(0, Math.min(right - 12, x + dx))
  if (mode.includes('e')) right = Math.min(100, Math.max(x + 12, right + dx))
  if (mode.includes('n')) y = Math.max(0, Math.min(bottom - 12, y + dy))
  if (mode.includes('s')) bottom = Math.min(100, Math.max(y + 12, bottom + dy))
  return { x, y, width: right - x, height: bottom - y }
}
