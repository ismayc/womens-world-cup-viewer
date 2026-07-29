import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from '../src/App.jsx'
import Standings from '../src/components/Standings.jsx'
import Bracket from '../src/components/Bracket.jsx'
import MatchCard from '../src/components/MatchCard.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { groupSlotMap } from '../src/utils/bracket.js'
import { resolveClinchedSlots } from '../src/utils/clinch.js'
import { DetailContext } from '../src/context/detail.js'
import { FollowProvider } from '../src/context/follow.jsx'

// Mock the results feed so mount doesn't hit the network.
beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  window.history.replaceState(null, '', '/')
})

describe('App renders (smoke test)', () => {
  // This is the test that would have caught the "black page" crash: a component
  // using a hook without importing it throws on render, and render() rejects.
  it('mounts without crashing and shows the header + views', () => {
    render(<App />)
    // The title appears in the header and again in the footer note.
    expect(screen.getAllByText(/Women’s World Cup 2023/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Schedule/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Week/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Groups/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Bracket/ })).toBeInTheDocument()
  })

  it('keeps the filter panel and search collapsed by default', () => {
    render(<App />)
    // Only a compact toggle shows; the panel, search button, and dropdowns are hidden.
    expect(screen.getByRole('button', { name: /Filters & Search/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /🔍 Search/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Group')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/team: Norway/)).not.toBeInTheDocument()
  })

  it('opens the panel, then the search, and filters with a scoped query', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    const input = screen.getByPlaceholderText(/team: Norway/)
    fireEvent.change(input, { target: { value: 'team: Vietnam' } })
    // Vietnam went out in the group stage, so its 3 group games are its whole
    // tournament — a knockout side (Jamaica, say) would also match bracket ties.
    expect(screen.getByText(/^3 matches$/)).toBeInTheDocument()
  })

  it('shows an active-filter count and "Clear all" when a filter is applied', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Filters & Search/ }))
    fireEvent.click(screen.getByRole('button', { name: /🔍 Search/ }))
    fireEvent.change(screen.getByPlaceholderText(/team: Norway/), {
      target: { value: 'team: Vietnam' },
    })
    expect(screen.getByRole('button', { name: /Clear all/ })).toBeInTheDocument()
    // Clearing resets results back to all 64 matches.
    fireEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(screen.queryByRole('button', { name: /Clear all/ })).not.toBeInTheDocument()
  })

  it('switches to each view without crashing', () => {
    render(<App />)
    for (const name of [/Week/, /Groups/, /Bracket/, /Schedule/]) {
      fireEvent.click(screen.getByRole('button', { name }))
    }
    // Bracket/standings rendered fine; header still present.
    expect(screen.getAllByText(/Women’s World Cup 2023/).length).toBeGreaterThan(0)
  })

  it('renders all 4 group tables in the Groups view', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Groups/ }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group D')).toBeInTheDocument()
  })

  it('opens the match-detail modal from a card', () => {
    // Pin mid-tournament so the schedule shows match cards regardless of the
    // real date (post-tournament, every day is collapsed/complete).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-07-26T12:00:00Z'))
    try {
      render(<App />)
      // Expand a collapsed day if no card is currently visible.
      if (screen.queryAllByRole('button', { name: /Details/ }).length === 0) {
        const toggle = document.querySelector('.day-toggle')
        if (toggle) fireEvent.click(toggle)
      }
      fireEvent.click(screen.getAllByRole('button', { name: /Details/ })[0])
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeInTheDocument()
      expect(within(dialog).getByText(/How to watch/)).toBeInTheDocument()
      expect(within(dialog).getByText(/Stadium local/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggles the color theme', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: /Toggle theme/ }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('shows a NextMatch countdown hero', () => {
    // Pin mid-tournament so there's an upcoming match to count down to (post-
    // tournament the hero shows the champions banner instead).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-07-26T12:00:00Z'))
    try {
      render(<App />)
      expect(screen.getByText(/Next match|Your next match|Live now/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows past days folded by default, expandable per-day, and hideable entirely', () => {
    // Pin "now" mid-tournament so the July 20 opener is firmly in the past.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-07-26T12:00:00Z'))
    try {
      render(<App />)
      // The committed schedule has every group result, so the app archives the
      // group stage and drops those days from the schedule. Bring them back —
      // they are the tournament's past days.
      fireEvent.click(screen.getByRole('button', { name: /Show group games/ }))
      // Past days appear as collapsed sections by default (no match cards yet).
      const opener = screen.getByRole('button', { name: /July 20, 2023/ })
      expect(opener).toHaveAttribute('aria-expanded', 'false')
      const openerDay = opener.closest('section.day')
      expect(within(openerDay).queryByRole('button', { name: /Details/ })).not.toBeInTheDocument()
      // Each past day still expands individually on click.
      fireEvent.click(opener)
      expect(opener).toHaveAttribute('aria-expanded', 'true')
      expect(within(openerDay).getAllByRole('button', { name: /Details/ }).length).toBeGreaterThan(0)
      // "Hide past days" drops them from the schedule entirely; "Show" brings
      // them back (folded again).
      fireEvent.click(screen.getByRole('button', { name: /Hide past days/ }))
      expect(screen.queryByRole('button', { name: /July 20, 2023/ })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Show past days/ }))
      expect(screen.getByRole('button', { name: /July 20, 2023/ })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps today and future days expanded by default', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-07-26T12:00:00Z'))
    try {
      render(<App />)
      // The final (August 20, 2023) is in the future — its day starts open.
      const futureDay = screen.getByRole('button', { name: /August 20, 2023/ })
      expect(futureDay).toHaveAttribute('aria-expanded', 'true')
    } finally {
      vi.useRealTimers()
    }
  })

})

describe('Standings clinch badges', () => {
  it('renders the clinch verdict next to a team when provided', () => {
    const clinch = { 'New Zealand': 'won-group', Zambia: 'eliminated' }
    render(
      <FollowProvider>
        <Standings matches={MATCHES} hideScores={false} clinch={clinch} />
      </FollowProvider>,
    )
    // Badges render as "🥇 Won group" / "❌ Eliminated" (emoji + text in one
    // node), and also appear in the legend — so match flexibly and expect ≥1.
    expect(screen.getAllByText(/Won group/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Eliminated/).length).toBeGreaterThan(0)
  })
})

describe('Schedule team-name slot tooltip', () => {
  const groupMatch = MATCHES.find((m) => m.num === 1) // New Zealand v Norway (Group A)

  function renderCard(clinch) {
    return render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <MatchCard match={groupMatch} tz="America/New_York" clinch={clinch} slotMap={groupSlotMap(MATCHES)} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
  }

  it('shows the conditional knockout route when undecided', () => {
    renderCard({})
    const title = screen.getByText('New Zealand').getAttribute('title')
    expect(title).toMatch(/Group A knockout route/)
    // Group A's winner and runner-up go to DIFFERENT round-of-16 ties (49 and
    // 50), because A is drawn against C rather than against B.
    expect(title).toMatch(/1st → Round of 16 · Match 49/)
    expect(title).toMatch(/2nd → Round of 16 · Match 50/)
    // There is no best-third route, so the third line is a dead end, not a
    // conditional qualification.
    expect(title).toMatch(/3rd or 4th → eliminated/)
  })

  it('shows the definite slot once the group winner is clinched', () => {
    renderCard({ 'New Zealand': 'won-group' })
    expect(screen.getByText('New Zealand').getAttribute('title')).toBe(
      'Clinched Group A winner → Round of 16 · Match 49',
    )
  })
})

describe('Bracket clinch resolution', () => {
  it('renders the clinched winner once slots are resolved in the match data', () => {
    // Resolution happens upstream (App) so the team flows to every view; the
    // Bracket just renders whatever names it's given.
    const resolved = resolveClinchedSlots(MATCHES, { 'New Zealand': 'won-group' })
    render(
      <FollowProvider>
        <DetailContext.Provider value={() => {}}>
          <Bracket matches={resolved} tz="America/New_York" hideScores={false} />
        </DetailContext.Provider>
      </FollowProvider>,
    )
    // M49's first side was "Winner Group A" — now resolved to New Zealand.
    expect(screen.getByText('New Zealand')).toBeInTheDocument()
    expect(screen.queryByText('Winner Group A')).not.toBeInTheDocument()
    // Other, unclinched winner slots remain placeholders.
    expect(screen.getByText('Winner Group B')).toBeInTheDocument()
  })
})

describe('Follow teams', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
    window.history.replaceState(null, '', '/')
    localStorage.clear()
  })

  it('following a team reveals the My Teams filter', () => {
    render(
      <FollowProvider>
        <App />
      </FollowProvider>,
    )
    expect(screen.queryByRole('button', { name: /My Teams/ })).not.toBeInTheDocument()
    // Past days collapse once the tournament is underway; expand one so a match
    // card (and its Follow buttons) is in the DOM regardless of the current date.
    if (screen.queryAllByRole('button', { name: /^Follow / }).length === 0) {
      const toggle = document.querySelector('.day-toggle')
      if (toggle) fireEvent.click(toggle)
    }
    fireEvent.click(screen.getAllByRole('button', { name: /^Follow / })[0])
    expect(screen.getByRole('button', { name: /My Teams/ })).toBeInTheDocument()
  })
})
