import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HeroTitle } from './HeroTitle'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('continues past the first second and types through the final question mark', () => {
  vi.useFakeTimers()
  const view = render(<HeroTitle />)
  const text = () =>
    Array.from(view.container.querySelectorAll('.hero-title-text')).map((e) => e.textContent)
  expect(screen.getByRole('heading', { name: '이 옷, 어디서 팔지?' })).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1000))
  expect(text()).toEqual(['이 옷,', '어'])
  act(() => vi.advanceTimersByTime(1000))
  expect(text()).toEqual(['이 옷,', '어디서 팔지?'])
  expect(view.container.querySelector('.hero-type-caret')).toBeNull()
  act(() => vi.advanceTimersByTime(5000))
  expect(text()).toEqual(['이 옷,', '어디서 팔지?'])
})

it('shows the full title immediately when reduced motion is requested', () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  const view = render(<HeroTitle />)
  expect(
    Array.from(view.container.querySelectorAll('.hero-title-text')).map((e) => e.textContent),
  ).toEqual(['이 옷,', '어디서 팔지?'])
})

it('clears the pending timer on unmount', () => {
  vi.useFakeTimers()
  const view = render(<HeroTitle />)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
