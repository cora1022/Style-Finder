import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultGrid } from './ResultGrid'
import type { SearchResult } from '../api/search'

const product: SearchResult = {
  catalogItemId: 'commonroom.t05',
  title: '클리어 스카이 셔츠',
  imageUrl: '/api/catalog/items/commonroom.t05/image',
  sourceUrl: 'https://shop3.cora1022.com/#/product/t05',
  similarityScore: 0.9,
  modelVersion: 'test',
  metadata: {
    category: '상의',
    colors: ['스카이블루'],
    styleTags: ['셔츠'],
    storeName: 'COMMON ROOM',
    price: 59000,
  },
}

function show(result: SearchResult) {
  render(
    <ResultGrid
      results={[result]}
      isLoading={false}
      isLoadingMore={false}
      revealKey={0}
      saveStates={{}}
      onFindMore={vi.fn()}
      onFindSimilarResult={vi.fn()}
      onSaveResult={vi.fn()}
    />,
  )
}

describe('store product links', () => {
  it('pops and scrolls only newly appended results into view', () => {
    vi.useFakeTimers()
    const scroll = vi.fn()
    const originalScroll = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    try {
      const props = {
        isLoading: false,
        isLoadingMore: false,
        saveStates: {},
        onFindMore: vi.fn(),
        onFindSimilarResult: vi.fn(),
        onSaveResult: vi.fn(),
      }
      const view = render(<ResultGrid {...props} results={[product]} revealKey={1} />)
      expect(scroll).not.toHaveBeenCalled()
      const next = { ...product, catalogItemId: 'new-shirt', title: '새 셔츠' }
      view.rerender(
        <ResultGrid
          {...props}
          results={[product, next]}
          revealKey={2}
          newResultIds={['new-shirt']}
        />,
      )
      expect(scroll).toHaveBeenCalledOnce()
      expect(scroll.mock.contexts[0]).toHaveAttribute('data-result-id', 'new-shirt')
      expect(scroll.mock.contexts[0]).toHaveClass('result-pop')
      expect(screen.getByAltText(product.title).closest('article')).not.toHaveClass('result-pop')
      expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
      act(() => vi.advanceTimersByTime(800))
      expect(scroll.mock.contexts[0]).not.toHaveClass('result-pop')
      expect(scroll).toHaveBeenCalledOnce()
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScroll
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
  it('shows the store and price and preserves the product hash address', () => {
    show(product)
    expect(screen.getByText('COMMON ROOM')).toBeInTheDocument()
    expect(screen.getByText('₩59,000')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '상품 보러 가기' })).toHaveAttribute(
      'href',
      product.sourceUrl,
    )
  })

  it('keeps legacy catalog items without a shop link usable', () => {
    show({
      ...product,
      sourceUrl: null,
      metadata: { category: 'shirt', colors: [], styleTags: [] },
    })
    expect(screen.getByText('로컬 카탈로그')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('rejects executable source URLs', () => {
    show({ ...product, sourceUrl: 'javascript:alert(1)' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
