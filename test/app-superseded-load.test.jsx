import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { fetchLive } from '../src/services/espn.js'

// A results load can be superseded before it lands: the app aborts the previous
// request whenever it starts another one (and on unmount). The abort surfaces as
// a rejection, and it must NOT be reported as "couldn't reach the feed" — the
// successor load is the one whose outcome counts. Everything else about the feed
// is exercised against a real ESPN payload in app-coverage.test.jsx; this file
// stubs the service outright because an abort is the one failure the payload
// cannot express.
vi.mock('../src/services/espn.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, fetchLive: vi.fn() }
})

const App = (await import('../src/App.jsx')).default

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App — a results load that was superseded', () => {
  it('stays quiet when the request was aborted rather than failing', async () => {
    fetchLive.mockRejectedValue(
      Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }),
    )
    render(<App />)
    // Give the rejection a chance to be handled.
    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    expect(screen.queryByText(/Couldn’t reach results feed/)).toBeNull()
  })

  it('still reports a genuine failure', async () => {
    // The other side of the same guard: anything that is not an abort is a real
    // failure and has to reach the status bar.
    fetchLive.mockRejectedValue(new Error('Live request failed'))
    render(<App />)
    expect(await screen.findByText(/Couldn’t reach results feed/)).toBeInTheDocument()
  })
})
