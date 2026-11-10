import { afterEach, describe, expect, it, vi } from 'vitest'
import { withMinimumDuration } from './minimumDuration'

afterEach(() => vi.useRealTimers())

describe('minimum search duration', () => {
  it('holds a fast response for 5.2 seconds', async () => {
    vi.useFakeTimers()
    const done = vi.fn()
    const result = withMinimumDuration(Promise.resolve('results')).then(done)
    await vi.advanceTimersByTimeAsync(5199)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(done).toHaveBeenCalledWith('results')
  })

  it('waits for a slow request rather than returning when the timer expires', async () => {
    vi.useFakeTimers()
    let resolve!: (value: string) => void
    const done = vi.fn()
    const result = withMinimumDuration(
      new Promise<string>((accept) => {
        resolve = accept
      }),
    ).then(done)
    await vi.advanceTimersByTimeAsync(6000)
    expect(done).not.toHaveBeenCalled()
    resolve('late results')
    await result
    expect(done).toHaveBeenCalledWith('late results')
  })
})
