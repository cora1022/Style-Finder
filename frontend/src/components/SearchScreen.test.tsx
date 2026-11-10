import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '../api/search'
import { SearchScreen } from './SearchScreen'
import { server } from '../test/server'

const products: SearchResult[] = ['red', 'blue', 'green', 'black'].map((color) => ({
  catalogItemId: 'test-' + color,
  title: color + ' 셔츠',
  imageUrl: '/api/catalog/items/test-' + color + '/image',
  sourceUrl: 'https://shop1.cora1022.com/#/product/test-' + color,
  similarityScore: 0.9,
  modelVersion: 'test/model@1',
  metadata: { category: '상의', colors: [color], styleTags: [] },
}))

function show() {
  render(<SearchScreen initialCatalogItemId="query-shirt" onBack={vi.fn()} onMyPage={vi.fn()} />)
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  server.use(
    http.post('/api/search/catalog/:id', () =>
      HttpResponse.json({ results: products.slice(0, 2) }),
    ),
    http.post('/api/members/search-histories', () => HttpResponse.json({ id: 1 }, { status: 201 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('search and activity failure isolation', () => {
  it('keeps usable search results when history persistence fails and can still save a result', async () => {
    let savedPayload: unknown
    server.use(
      http.post('/api/members/search-histories', () =>
        HttpResponse.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 }),
      ),
      http.post('/api/members/saved-results', async ({ request }) => {
        savedPayload = await request.json()
        return HttpResponse.json({ id: 11 }, { status: 201 })
      }),
    )
    show()
    expect(await screen.findByText('검색 기록을 저장하지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'red 셔츠' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '상품 보러 가기' })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'red 셔츠 저장' }))
    expect(await screen.findByRole('button', { name: 'red 셔츠 저장됨' })).toBeDisabled()
    expect(savedPayload).toEqual(products[0])
  })

  it('preserves results and retries the same page after an additional search fails', async () => {
    const requested: number[] = []
    let finish!: () => void
    const responseGate = new Promise<void>((resolve) => {
      finish = resolve
    })
    let attempts = 0
    server.use(
      http.post('/api/search/catalog/:id', async ({ request }) => {
        const topK = Number(new URL(request.url).searchParams.get('topK') || 2)
        requested.push(topK)
        if (topK === 4 && attempts++ === 0) {
          await responseGate
          return HttpResponse.json({ error: { code: 'SEARCH_UNAVAILABLE' } }, { status: 503 })
        }
        return HttpResponse.json({ results: products.slice(0, topK) })
      }),
    )
    show()
    const more = await screen.findByRole('button', { name: '다음 2개 더 찾기' })
    await waitFor(() => expect(more).toBeEnabled())
    fireEvent.click(more)
    try {
      expect(screen.getByRole('button', { name: '더 찾고 있어요...' })).toBeDisabled()
      expect(screen.queryByText('사진 속 옷을 살펴보고 있어요.')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'red 셔츠' })).toBeInTheDocument()
    } finally {
      finish()
    }
    expect(await screen.findByRole('alert')).toHaveTextContent('검색 서비스를 사용할 수 없습니다.')
    fireEvent.click(screen.getByRole('button', { name: '다음 2개 더 찾기' }))
    expect(await screen.findByRole('heading', { name: 'black 셔츠' })).toBeInTheDocument()
    expect(requested).toEqual([2, 4, 4])
    expect(screen.getAllByRole('link', { name: '상품 보러 가기' })).toHaveLength(4)
  })

  it('allows retrying a failed save without losing the search results', async () => {
    let attempts = 0
    server.use(
      http.post('/api/members/saved-results', () => {
        attempts += 1
        return attempts === 1
          ? HttpResponse.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 })
          : HttpResponse.json({ id: 1 }, { status: 201 })
      }),
    )
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'red 셔츠 저장' }))
    const retry = await screen.findByRole('button', { name: 'red 셔츠 다시 저장' })
    expect(retry).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'red 셔츠' })).toBeInTheDocument()
    fireEvent.click(retry)
    expect(await screen.findByRole('button', { name: 'red 셔츠 저장됨' })).toBeDisabled()
    expect(attempts).toBe(2)
  })

  it('treats a duplicate save as already saved instead of presenting a retry', async () => {
    server.use(
      http.post('/api/members/saved-results', () =>
        HttpResponse.json({ error: { code: 'DUPLICATE_SAVED_RESULT' } }, { status: 409 }),
      ),
    )
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'red 셔츠 저장' }))
    expect(await screen.findByRole('button', { name: 'red 셔츠 저장됨' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'red 셔츠 다시 저장' })).not.toBeInTheDocument()
  })

  it('shows a recoverable error and does not write history when search is unavailable', async () => {
    let historyWrites = 0
    server.use(
      http.post('/api/search/catalog/:id', () =>
        HttpResponse.json({ error: { code: 'SEARCH_BUSY' } }, { status: 429 }),
      ),
      http.post('/api/members/search-histories', () => {
        historyWrites += 1
        return HttpResponse.json({ id: 1 })
      }),
    )
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('검색 요청이 많습니다.')
    expect(screen.queryByText('사진 속 옷을 살펴보고 있어요.')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '상품 보러 가기' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다른 사진 선택' })).toBeEnabled()
    expect(historyWrites).toBe(0)
  })
})
