import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { server } from './server'

beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open')
      },
    },
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  server.resetHandlers()
})
afterAll(() => server.close())
