import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/members/oauth2/status', () => HttpResponse.json({ enabled: false })),
)
