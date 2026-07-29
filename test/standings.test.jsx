import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Build a set of matches with some Group A results played so "As it stands"
// projection, badges and the played path all render.
function withGroupAPlayed() {
  return MATCHES.map((m) => {
    if (m.stage === 'Group' && m.group === 'A') {
      return { ...m, score: [2, 0] }
    }
    return m
  })
}

// Group A played out to a clean 9/6/3/0 hierarchy — New Zealand, Norway,
// Switzerland, Philippines — so every row's verdict is fixed by points alone,
// with no tie-breaker. Group A fixtures: M1 NZL v NOR, M3 PHI v SUI,
// M17 NZL v PHI, M18 SUI v NOR, M33 SUI v NZL, M34 NOR v PHI. Note M18 and M34
// run the opposite way round from their Copa counterparts, so the scores below
// are oriented to THESE fixtures.
const GROUP_A_COMPLETE = { 1: [2, 0], 33: [0, 2], 17: [2, 0], 34: [2, 0], 18: [0, 2], 3: [0, 2] }
function withGroupAComplete() {
  return MATCHES.map((m) => (GROUP_A_COMPLETE[m.num] ? { ...m, score: GROUP_A_COMPLETE[m.num] } : m))
}

const renderStandings = (props = {}) =>
  render(
    <FollowProvider>
      <Standings matches={MATCHES} hideScores={false} {...props} />
    </FollowProvider>,
  )

describe('Standings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the legend, toolbar and group tables', () => {
    renderStandings()
    expect(screen.getByText(/Top two advance/)).toBeInTheDocument()
    expect(screen.getByText('Group A')).toBeInTheDocument()
    // No matches played -> the per-group note is shown.
    expect(screen.getAllByText('No matches played yet').length).toBeGreaterThan(0)
  })

  it('shows clinch badges when clinch verdicts are passed', () => {
    renderStandings({ clinch: { 'New Zealand': 'won-group', Zambia: 'eliminated' } })
    // The won-group badge text also appears in the legend, so >1.
    expect(screen.getAllByText(/Won group/).length).toBeGreaterThan(1)
    // The eliminated badge renders its own "Eliminated" text in a row.
    expect(screen.getByText(/Eliminated/)).toBeInTheDocument()
  })

  it('tints group rows green when advancing and red when out, plain in between', () => {
    // Group A complete: New Zealand 9 (1st), Norway 6 (2nd), Switzerland 3 (3rd),
    // Philippines 0. There is no best-third route here, so no "provisional"
    // yellow tier the Euro sibling needs — a third-placed team is simply out.
    const fixture = withGroupAComplete()
    const { container } = render(
      <FollowProvider>
        <Standings
          matches={fixture}
          hideScores={false}
          clinch={{ 'New Zealand': 'won-group', Philippines: 'eliminated' }}
        />
      </FollowProvider>,
    )
    const rowFor = (team) =>
      [...container.querySelectorAll('.standings-table tbody tr')].find(
        (tr) => tr.querySelector('.row-team-btn')?.textContent === team,
      )
    expect(rowFor('New Zealand').className).toBe('qualifies') // clinched winner → green
    expect(rowFor('Norway').className).toBe('qualifies') // 2nd → green
    expect(rowFor('Switzerland').className).toBe('') // 3rd → no tint, no yellow tier
    expect(rowFor('Philippines').className).toBe('eliminated') // out → red

    // Wide text verdicts drop to their own line (q-wide); the single-glyph "✓"
    // qualification mark stays inline beside the name.
    const badgeIn = (team) => rowFor(team).querySelector('.col-team .q-badge')
    expect(badgeIn('New Zealand').classList.contains('q-wide')).toBe(true) // 🥇 Won group
    expect(badgeIn('Philippines').classList.contains('q-wide')).toBe(true) // ❌ Eliminated
    expect(badgeIn('Norway').classList.contains('q-wide')).toBe(false) // ✓ stays inline
    // The provisional ✓ spells out that it's contingent on current results, and
    // names the round this edition actually advances to — the round of 16.
    expect(badgeIn('Norway').getAttribute('title')).toBe(
      'Advances to the round of 16\n(if current match status holds)',
    )
  })

  it('hides standings in spoiler-free mode and reveals on click', () => {
    renderStandings({ hideScores: true })
    expect(screen.getByText(/Standings are hidden/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reveal standings/ }))
    expect(screen.getByText('Group A')).toBeInTheDocument()
  })

  it('toggles the "As it stands" projection and persists the choice', () => {
    renderStandings()
    const toggle = screen.getByRole('button', { name: /As it stands/ })
    // Default is shown.
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('wwc:asItStands')).toBe('0')
    fireEvent.click(toggle)
    expect(localStorage.getItem('wwc:asItStands')).toBe('1')
  })

  it('reads the persisted "hidden" projection preference on mount', () => {
    localStorage.setItem('wwc:asItStands', '0')
    renderStandings()
    expect(screen.getByRole('button', { name: /Show .As it stands/ })).toBeInTheDocument()
  })

  it('renders the tie-breakers tooltip note', () => {
    renderStandings()
    const tb = screen.getByText('tie-breakers')
    expect(tb).toHaveAttribute('role', 'note')
    expect(tb).toHaveAttribute('data-tip')
  })

  it('renders the "As it stands" rows and follows the onGoToMatch link', () => {
    const seen = []
    render(
      <FollowProvider>
        <Standings
          matches={withGroupAPlayed()}
          hideScores={false}
          onGoToMatch={(n) => seen.push(n)}
        />
      </FollowProvider>,
    )
    // Projection title is present for the played group.
    expect(screen.getAllByText(/As it stands → Round of 16/).length).toBeGreaterThan(0)
    // The M-link buttons jump to the bracket (identified by their title).
    const links = document.querySelectorAll('button.ais-match-link')
    expect(links.length).toBeGreaterThan(0)
    fireEvent.click(links[0])
    expect(seen.length).toBe(1)
  })

  it('renders projection M-numbers as plain text when no onGoToMatch handler', () => {
    render(
      <FollowProvider>
        <Standings matches={withGroupAPlayed()} hideScores={false} />
      </FollowProvider>,
    )
    expect(screen.getAllByText(/As it stands → Round of 16/).length).toBeGreaterThan(0)
    // No link buttons when handler absent; plain M-number spans instead.
    expect(document.querySelectorAll('button.ais-match-link').length).toBe(0)
    expect(document.querySelectorAll('span.ais-match').length).toBeGreaterThan(0)
  })

  it('falls back to showing the projection when localStorage.getItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      renderStandings()
      // Defaults to shown (catch returns true).
      expect(screen.getByRole('button', { name: /Hide .As it stands/ })).toBeInTheDocument()
    } finally {
      spy.mockRestore()
    }
  })

  it('swallows errors when localStorage.setItem throws on toggle', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      renderStandings()
      const toggle = screen.getByRole('button', { name: /As it stands/ })
      fireEvent.click(toggle)
      // Toggle still flips state despite the storage write failing.
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
    } finally {
      spy.mockRestore()
    }
  })

  it('toggles following a team via the star button', () => {
    renderStandings()
    const stars = screen.getAllByRole('button', { name: /^Follow / })
    fireEvent.click(stars[0])
    expect(screen.getAllByRole('button', { name: /^Unfollow / }).length).toBeGreaterThan(0)
  })
})
