import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cropImage,
  searchCatalogItem,
  searchImage,
  type CropBox,
  type SearchResult,
} from '../api/search'
import { ActivityApiError, createSavedResult, createSearchHistory } from '../api/activity'
import { validateImageFile } from '../utils/imageValidation'
import { withMinimumDuration } from '../utils/minimumDuration'
import { ResultGrid } from './ResultGrid'
import { SearchLoadingOverlay } from './SearchLoadingOverlay'
import { UploadPanel } from './UploadPanel'
import { AppHeader, ImagePicker, SearchSteps } from './Ui'
import { ArrowCounterClockwiseIcon, UploadSimpleIcon } from '@phosphor-icons/react'

type Props = {
  initialFile?: File | null
  onBack: () => void
  onMyPage: () => void
  initialCatalogItemId?: string | null
  onInitialCatalogConsumed?: () => void
}
type AutoCropMeta = {
  cropApplied: boolean
  cropBox: CropBox | null
  originalSize: string | null
  cropSize: string | null
  detector: string | null
}

export function SearchScreen({
  initialFile,
  onBack,
  onMyPage,
  initialCatalogItemId,
  onInitialCatalogConsumed,
}: Props) {
  const originalUrl = useRef<string | null>(null)
  const searchUrl = useRef<string | null>(null)
  const initialSearchStarted = useRef<string | null>(null)
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [searchFile, setSearchFile] = useState<File | null>(null)
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null)
  const [searchPreviewUrl, setSearchPreviewUrl] = useState<string | null>(null)
  const [cropMode, setCropMode] = useState<'auto' | 'manual'>('auto')
  const [autoCropMeta, setAutoCropMeta] = useState<AutoCropMeta | null>(null)
  const [catalogQueryId, setCatalogQueryId] = useState<string | null>(initialCatalogItemId ?? null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [newResultIds, setNewResultIds] = useState<string[]>([])
  const [requestedTopK, setRequestedTopK] = useState(2)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<1 | 2>(1)
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [activeStep])
  const [resultRevealKey, setResultRevealKey] = useState(0)
  const [uploadRevealKey, setUploadRevealKey] = useState(0)
  const [saveStates, setSaveStates] = useState<
    Record<string, 'saving' | 'saved' | 'duplicate' | 'error'>
  >({})
  const [activityMessage, setActivityMessage] = useState<string | null>(null)

  const releaseUrls = useCallback(() => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current)
    if (searchUrl.current && searchUrl.current !== originalUrl.current)
      URL.revokeObjectURL(searchUrl.current)
    originalUrl.current = null
    searchUrl.current = null
  }, [])
  useEffect(() => releaseUrls, [releaseUrls])
  const setSearchPreview = (url: string) => {
    if (searchUrl.current && searchUrl.current !== originalUrl.current && searchUrl.current !== url)
      URL.revokeObjectURL(searchUrl.current)
    searchUrl.current = url
    setSearchPreviewUrl(url)
  }

  const handleFileSelect = useCallback(
    async (file: File) => {
      try {
        await validateImageFile(file)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '이미지를 확인할 수 없습니다.')
        return
      }
      releaseUrls()
      const url = URL.createObjectURL(file)
      originalUrl.current = url
      searchUrl.current = url
      setOriginalFile(file)
      setSearchFile(null)
      setOriginalPreviewUrl(url)
      setSearchPreviewUrl(url)
      setCatalogQueryId(null)
      setCropMode('manual')
      setAutoCropMeta(null)
      setResults([])
      setRequestedTopK(2)
      setErrorMessage(null)
      setActiveStep(1)
      setResultRevealKey(0)
      setUploadRevealKey((value) => value + 1)
    },
    [releaseUrls],
  )

  useEffect(() => {
    let active = true
    if (initialFile)
      void Promise.resolve().then(() => {
        if (active) return handleFileSelect(initialFile)
      })
    return () => {
      active = false
    }
  }, [initialFile, handleFileSelect])

  const handleCropModeChange = (mode: 'auto' | 'manual') => {
    setCropMode(mode)
    if (originalFile && originalPreviewUrl) {
      setSearchFile(null)
      setSearchPreview(originalPreviewUrl)
      setAutoCropMeta(null)
    }
  }
  const handleAutoCrop = async () => {
    if (!originalFile) return setErrorMessage('자동 크롭할 이미지를 먼저 선택해주세요.')
    setIsCropping(true)
    setErrorMessage(null)
    try {
      const result = await cropImage(originalFile)
      const url = URL.createObjectURL(result.file)
      setSearchFile(result.file)
      setSearchPreview(url)
      setAutoCropMeta(result)
      setResults([])
      setRequestedTopK(2)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '자동 크롭 중 오류가 발생했습니다.')
    } finally {
      setIsCropping(false)
    }
  }
  const handleManualCrop = (file: File, url: string) => {
    setCropMode('manual')
    setAutoCropMeta(null)
    setSearchFile(file)
    setSearchPreview(url)
    setResults([])
    setRequestedTopK(2)
    setErrorMessage(null)
  }
  const handleSearch = async () => {
    if (!searchFile) return setErrorMessage('검색 전에 크롭 영역을 먼저 확정해주세요.')
    setCatalogQueryId(null)
    setIsLoading(true)
    setNewResultIds([])
    setErrorMessage(null)
    try {
      const response = await withMinimumDuration(searchImage(searchFile))
      setResults(response.results)
      setRequestedTopK(2)
      setActiveStep(2)
      setResultRevealKey((value) => value + 1)
      try {
        await createSearchHistory('IMAGE_UPLOAD', cropMode === 'auto' ? 'AUTO' : 'MANUAL')
      } catch {
        setActivityMessage('검색은 완료됐지만 검색 기록을 저장하지 못했습니다.')
      }
    } catch (error) {
      setResults([])
      setErrorMessage(
        error instanceof Error ? error.message : '이미지 검색 중 오류가 발생했습니다.',
      )
    } finally {
      setIsLoading(false)
    }
  }
  const handleFindMore = async () => {
    if ((!searchFile && !catalogQueryId) || requestedTopK >= 20) return
    const topK = Math.min(20, requestedTopK + 2)
    setIsLoadingMore(true)
    setNewResultIds([])
    setErrorMessage(null)
    try {
      const response = catalogQueryId
        ? await searchCatalogItem(catalogQueryId, topK)
        : await searchImage(searchFile!, topK)
      const existingIds = new Set(results.map((item) => item.catalogItemId))
      setNewResultIds(
        response.results
          .filter((item) => !existingIds.has(item.catalogItemId))
          .map((item) => item.catalogItemId),
      )
      setResults(response.results)
      setRequestedTopK(topK)
      setResultRevealKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '추가 검색 중 오류가 발생했습니다.')
    } finally {
      setIsLoadingMore(false)
    }
  }
  const handleFindSimilarResult = async (item: SearchResult) => {
    setNewResultIds([])
    setCatalogQueryId(item.catalogItemId)
    setIsLoading(true)
    setErrorMessage(null)
    setActiveStep(2)
    try {
      const response = await searchCatalogItem(item.catalogItemId)
      setResults(response.results)
      setRequestedTopK(2)
      setResultRevealKey((value) => value + 1)
      try {
        await createSearchHistory('CATALOG_ITEM', 'CATALOG')
      } catch {
        setActivityMessage('검색 기록을 저장하지 못했습니다.')
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '유사 이미지 검색 중 오류가 발생했습니다.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveResult = async (item: SearchResult) => {
    setSaveStates((current) => ({ ...current, [item.catalogItemId]: 'saving' }))
    setActivityMessage(null)
    try {
      await createSavedResult(item)
      setSaveStates((current) => ({ ...current, [item.catalogItemId]: 'saved' }))
    } catch (error) {
      const state =
        error instanceof ActivityApiError && error.code === 'DUPLICATE_SAVED_RESULT'
          ? 'duplicate'
          : 'error'
      setSaveStates((current) => ({ ...current, [item.catalogItemId]: state }))
      if (state === 'error')
        setActivityMessage('결과를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  useEffect(() => {
    if (!initialCatalogItemId || initialSearchStarted.current === initialCatalogItemId) return
    initialSearchStarted.current = initialCatalogItemId
    setIsLoading(true)
    setActiveStep(2)
    setErrorMessage(null)
    searchCatalogItem(initialCatalogItemId)
      .then(async (response) => {
        setResults(response.results)
        setRequestedTopK(2)
        setResultRevealKey((value) => value + 1)
        try {
          await createSearchHistory('CATALOG_ITEM', 'CATALOG')
        } catch {
          setActivityMessage('검색 기록을 저장하지 못했습니다.')
        }
      })
      .catch((error) =>
        setErrorMessage(
          error instanceof Error ? error.message : '저장 이미지 재검색에 실패했습니다.',
        ),
      )
      .finally(() => {
        setIsLoading(false)
        onInitialCatalogConsumed?.()
      })
  }, [initialCatalogItemId, onInitialCatalogConsumed])

  const currentStep = activeStep === 2 ? 2 : originalPreviewUrl ? 1 : 0
  const queryPreview = catalogQueryId
    ? '/api/catalog/items/' + encodeURIComponent(catalogQueryId) + '/image'
    : searchPreviewUrl
  return (
    <main className="search-screen">
      <AppHeader onHome={onBack} onMyPage={onMyPage} />
      <div className="workspace">
        <SearchSteps
          current={currentStep}
          onChange={(step) => {
            if (step < 2) setActiveStep(1)
          }}
        />
        <header
          className={
            'workspace-heading' + (activeStep === 1 && originalPreviewUrl ? ' centered' : '')
          }
        >
          <h1>
            {activeStep === 2
              ? '비슷한 옷을 찾았어요.'
              : originalPreviewUrl
                ? '찾고 싶은 옷을 골라주세요.'
                : '찾고 싶은 옷이 있는 사진을 올려주세요.'}
          </h1>
          <p>
            {activeStep === 2
              ? '이미지의 형태와 색상을 비교한 검색 결과예요.'
              : originalPreviewUrl
                ? '테두리를 움직여 검색할 영역을 맞춰보세요.'
                : '옷 사진을 올리고 궁금한 부분을 골라보세요.'}
          </p>
        </header>
        {activeStep === 1 ? (
          <UploadPanel
            sourceImageUrl={originalPreviewUrl}
            previewImageUrl={searchPreviewUrl}
            cropMode={cropMode}
            uploadRevealKey={uploadRevealKey}
            autoCropMeta={autoCropMeta}
            canSearch={Boolean(searchFile)}
            isLoading={isLoading}
            isCropping={isCropping}
            errorMessage={errorMessage}
            onFileSelect={handleFileSelect}
            onCropModeChange={handleCropModeChange}
            onAutoCrop={handleAutoCrop}
            onApplyManualCrop={handleManualCrop}
            onError={setErrorMessage}
            onSearch={handleSearch}
          />
        ) : (
          <div className="results-workspace">
            <aside className="query-sidebar">
              <h2>검색한 사진</h2>
              {queryPreview && (
                <img className="query-photo" src={queryPreview} alt="검색 기준이 된 옷 사진" />
              )}
              {originalPreviewUrl && !catalogQueryId && (
                <button className="text-button" onClick={() => setActiveStep(1)}>
                  <ArrowCounterClockwiseIcon />
                  영역 다시 선택
                </button>
              )}
              <div className="query-upload">
                <UploadSimpleIcon aria-hidden="true" />
                <ImagePicker compact onSelect={(file) => void handleFileSelect(file)} />
              </div>
            </aside>
            <div>
              <ResultGrid
                newResultIds={newResultIds}
                results={results}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                revealKey={resultRevealKey}
                saveStates={saveStates}
                onFindMore={handleFindMore}
                onFindSimilarResult={handleFindSimilarResult}
                onSaveResult={handleSaveResult}
              />
              {errorMessage && (
                <p className="error-message" role="alert">
                  {errorMessage}
                </p>
              )}
              {activityMessage && (
                <p className="activity-message" role="status">
                  {activityMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <SearchLoadingOverlay isVisible={isLoading} />
    </main>
  )
}
