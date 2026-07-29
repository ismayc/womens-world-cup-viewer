import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { FollowProvider } from '../src/context/follow.jsx'
import { DetailContext } from '../src/context/detail.js'
import Standings from '../src/components/Standings.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeClinch } from '../src/utils/clinch.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

const renderStandings = (matches, opener = () => {}, clinch = {}) =>
  render(
    <FollowProvider>
      <DetailContext.Provider value={opener}>
        <Standings matches={matches} tz="America/New_York" hideScores={false} clinch={clinch} />
      </DetailContext.Provider>
    </FollowProvider>,
  )

// Give Group A one finished result so the modal has both a result and upcoming games.
const withGroupAResult = () =>
  MATCHES.map((m) => (m.num === 1 ? { ...m, score: [2, 1] } : m))

// A real mid-tournament snapshot: every group complete EXCEPT C, which still has
// its final matchday to play. Groups B and D are both settled, so the tie between
// them — Winner B v Runner-up D, the real M53 — is mathematically locked while
// Group C is still being played. Used for the settled-matchup case. (A's tie is
// NOT locked: A is drawn against C, the one group still open.)
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

describe('Group games pop-up', () => {
  // Pinned between New Zealand's first game (M1, 20 July) and their second
  // (M17, 25 July): on the real clock every fixture is in the past, so "Still to
  // play" renders empty and the assertion below would pass against an
  // unconditional heading rather than against actual upcoming fixtures.
  it('shows only the selected team’s three matches when a team is clicked', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-07-22T12:00:00Z'))
    try {
      renderStandings(withGroupAResult())

      fireEvent.click(screen.getByRole('button', { name: 'New Zealand' }))

      const dialog = screen.getByRole('dialog')
      expect(dialog.querySelector('.gg-head-team')).toHaveTextContent('New Zealand')
      // A team plays exactly three group-stage games.
      expect(dialog.querySelectorAll('.gg-fixture')).toHaveLength(3)
      // Played section shows the finished result; still-to-play lists the rest.
      expect(within(dialog).getByText('Results')).toBeInTheDocument()
      expect(within(dialog).getByText('Still to play')).toBeInTheDocument()
      expect(within(dialog).getByText('2–1')).toBeInTheDocument()
      // The section is genuinely populated: M9 and M17 are still ahead.
      const upcoming = dialog.querySelectorAll('.md-section')[1]
      expect(upcoming.querySelectorAll('.gg-fixture')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the whole group’s six matches when the group title is clicked', () => {
    renderStandings(withGroupAResult())

    fireEvent.click(screen.getByRole('button', { name: 'Group A' }))

    const dialog = screen.getByRole('dialog')
    // A four-team group plays six matches in all.
    expect(dialog.querySelectorAll('.gg-fixture')).toHaveLength(6)
  })

  it('clicking a fixture opens the match detail view', () => {
    let opened = null
    renderStandings(withGroupAResult(), (m) => {
      opened = m
    })

    fireEvent.click(screen.getByRole('button', { name: 'New Zealand' }))
    const dialog = screen.getByRole('dialog')
    // The finished fixture row (New Zealand v Norway) opens its detail.
    fireEvent.click(within(dialog).getByText('2–1').closest('button'))

    expect(opened?.num).toBe(1)
  })

  it('shows a tip describing the team / group click functionality', () => {
    renderStandings(MATCHES)
    const tip = document.querySelector('.standings-tip')
    expect(tip).toBeInTheDocument()
    expect(tip).toHaveTextContent(/click a team name/i)
    expect(tip).toHaveTextContent(/group title/i)
  })

  it('shows the round-of-16 matchup for a team that has clinched a place', () => {
    renderStandings(MATCHES, () => {}, { 'New Zealand': 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'New Zealand' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko).toHaveTextContent(/Round of 16/i)
    expect(ko).toHaveTextContent(/qualified for the knockout round/i)
    // The selected team appears in the projected matchup line.
    expect(ko.querySelector('.gg-ko-match')).toHaveTextContent('New Zealand')
  })

  it('shows a confirmed (non-provisional) matchup when the opponent is locked', () => {
    // Live snapshot: Australia won Group B and Denmark finished second in Group D,
    // so their round-of-16 tie is locked even though Group C is still playing.
    // (It is also the real M53, which Australia went on to win 2–0.)
    renderStandings(snapshot, () => {}, computeClinch(snapshot))

    fireEvent.click(screen.getByRole('button', { name: 'Australia' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-match')).toHaveTextContent('Denmark')
    expect(ko.querySelector('.gg-ko-confirmed')).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-note')).toBeNull()
  })

  it('keeps the "provisional" note while the opponent can still change', () => {
    renderStandings(MATCHES, () => {}, { 'New Zealand': 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'New Zealand' }))
    const ko = document.querySelector('.gg-knockout')
    expect(ko).toBeInTheDocument()
    expect(ko.querySelector('.gg-ko-confirmed')).toBeNull()
    expect(ko.querySelector('.gg-ko-note')).toBeInTheDocument()
  })

  it('omits the round-of-16 section for a team that has not clinched', () => {
    renderStandings(MATCHES) // empty clinch map

    fireEvent.click(screen.getByRole('button', { name: 'New Zealand' }))
    expect(document.querySelector('.gg-knockout')).toBeNull()
  })

  it('shows no knockout section when a group title (no single team) is opened', () => {
    renderStandings(MATCHES, () => {}, { 'New Zealand': 'won-group' })

    fireEvent.click(screen.getByRole('button', { name: 'Group A' }))
    expect(document.querySelector('.gg-knockout')).toBeNull()
  })
})
