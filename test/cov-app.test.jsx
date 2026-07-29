import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from '../src/App.jsx'
import { unscored, espnScoreboard } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board.
//
// The real results have to come through vi.importActual: the vi.mock below
// replaces this module for EVERY importer, this file included, so a plain
// `import { MATCHES }` here would hand back the blanked board and any feed built
// from it would serve 64 unplayed fixtures — passing while proving nothing.
const { MATCHES: PLAYED } = await vi.importActual('../src/data/matches.js')
const MATCHES = unscored(PLAYED)
import { LIVE_SOURCE } from '../src/services/espn.js'

// The group-stage analysis tabs (Scenarios, R16 Outlook) only exist while the
// group stage is unarchived, and the committed schedule ships every result — so
// run these against a PRE-TOURNAMENT board and archive it explicitly, from the
// real feed, when a test needs the archived state.
vi.mock('../src/data/matches.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    MATCHES: actual.MATCHES.map((m) => {
      const { score, pens, aet, goals, live, statusLabel, cards, ...rest } = m
      return m.label1 ? { ...rest, t1: m.label1, t2: m.label2 } : rest
    }),
  }
})

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Serve every real GROUP result over the wire, which is what archives the group
// stage (groupStageArchived → true) on the otherwise blank board this file
// mocks. The knockout matches stay unplayed, so the tabs that only exist before
// the knockouts begin are still reachable.
//
// ESPN-shaped, because ESPN is this app's only runtime source: the sibling
// viewers mock OpenFootball's cup.txt here, and serving text to a fetch that
// asks for JSON would return a feed the app cannot read — the mock would pass
// while proving nothing.
function fetchArchived() {
  const groupResults = espnScoreboard(PLAYED.filter((m) => m.stage === 'Group'))
  return vi.fn(async (url) => {
    if (typeof url === 'string' && url.startsWith(LIVE_SOURCE.url)) {
      return { ok: true, json: async () => groupResults }
    }
    return { ok: true, json: async () => ({ events: [] }) }
  })
}

describe('App coverage — extra lines', () => {
  // Lines 553-558: archived group stage hint on the schedule view.
  it('shows the "group games hidden" schedule note once the group stage is archived', async () => {
    global.fetch = fetchArchived()
    render(<App />)
    // Wait for the archive to take effect (the note renders only when archived
    // and the Group filter is not selected).
    const note = await screen.findByText(/Group stage complete/)
    expect(note).toBeInTheDocument()
    expect(note.textContent).toMatch(/group games hidden/)

    // Clicking "Show group games" sets the Group stage filter and clears the note.
    const showBtn = screen.getByRole('button', { name: /Show group games/ })
    fireEvent.click(showBtn)
    await waitFor(() =>
      expect(screen.queryByText(/Group stage complete/)).not.toBeInTheDocument(),
    )
  })

  // Lines 609-618: the scenarios and outlook <main> blocks, which render only
  // while the group stage is NOT archived (so those tabs stay visible).
  it('renders the Scenarios and R16 Outlook views while the group stage is in play', async () => {
    // Stub the Web Worker that OutlookView spawns — jsdom has none.
    const origWorker = global.Worker
    class FakeWorker {
      constructor() {}
      postMessage() {}
      terminate() {}
      addEventListener() {}
      removeEventListener() {}
    }
    global.Worker = FakeWorker
    try {
      // Default fetch leaves the group stage unplayed → analysis tabs visible.
      render(<App />)

      fireEvent.click(screen.getByRole('button', { name: /Scenarios/ }))
      expect(document.querySelector('main.scenarios-view')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /R16 Outlook/ }))
      expect(document.querySelector('main.outlook-view')).toBeInTheDocument()
    } finally {
      global.Worker = origWorker
    }
  })
})
