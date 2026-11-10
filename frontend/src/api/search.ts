import { toUserError } from './errors'
import { authorizedFetch } from './members'

export type CatalogMetadata = {
  category: string
  colors: string[]
  styleTags: string[]
  storeId?: string | null
  storeName?: string | null
  productKey?: string | null
  price?: number | null
}

export type SearchResult = {
  catalogItemId: string
  title: string
  imageUrl: string
  sourceUrl?: string | null
  similarityScore: number
  metadata: CatalogMetadata
  modelVersion: string
}

type ImageSearchResponse = { results: SearchResult[] }

export type CropBox = { x: number; y: number; width: number; height: number }
export type CropImageResult = {
  file: File
  cropApplied: boolean
  cropBox: CropBox | null
  originalSize: string | null
  cropSize: string | null
  detector: string | null
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''

async function requestSearch(path: string, file?: File) {
  const formData = file ? new FormData() : undefined
  if (file) formData?.append('file', file)
  const response = await authorizedFetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw await toUserError(response, '이미지 검색 중 오류가 발생했습니다.')
  return (await response.json()) as ImageSearchResponse
}

export function searchImage(file: File, topK = 2) {
  return requestSearch(`/api/search/image?topK=${topK}`, file)
}

export function searchCatalogItem(catalogItemId: string, topK = 2) {
  return requestSearch(`/api/search/catalog/${encodeURIComponent(catalogItemId)}?topK=${topK}`)
}

export async function cropImage(file: File): Promise<CropImageResult> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await authorizedFetch(`${apiBaseUrl}/api/preprocess/crop`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw await toUserError(response, '자동 크롭 중 오류가 발생했습니다.')
  const blob = await response.blob()
  const cropBoxHeader = response.headers.get('X-Crop-Box')
  return {
    file: new File([blob], `opencv-crop-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' }),
    cropApplied: response.headers.get('X-Crop-Applied') === 'true',
    cropBox: cropBoxHeader ? (JSON.parse(cropBoxHeader) as CropBox) : null,
    originalSize: response.headers.get('X-Original-Size'),
    cropSize: response.headers.get('X-Crop-Size'),
    detector: response.headers.get('X-Crop-Detector'),
  }
}
