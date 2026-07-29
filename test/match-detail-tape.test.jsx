import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MatchDetail from '../src/components/MatchDetail.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

// A synthetic mini-tournament so both semifinalists have records. The match
// numbers are deliberately outside the real 1–64 range: this is a fixture the
// component reads, not the schedule.
//
// Note the shootout carries `aet` as well as `pens`. Every level knockout tie in
// this edition played extra time first, so `pens` without `aet` is the Copa
// sibling's shape and must not be reintroduced here.
const allMatches = [
  { num: 1, stage: 'Group', group: 'C', t1: 'Spain', t2: 'Costa Rica', venue: 'stadiumaustralia', ko: '2023-07-25T21:00:00+10:00', score: [2, 0] },
  { num: 2, stage: 'Group', group: 'E', t1: 'Netherlands', t2: 'United States', venue: 'stadiumaustralia', ko: '2023-07-26T18:00:00+10:00', score: [1, 1] },
  { num: 97, stage: 'QF', t1: 'Spain', t2: 'United States', venue: 'stadiumaustralia', ko: '2023-08-11T18:00:00+10:00', score: [1, 1], aet: true, pens: [4, 3] },
  { num: 98, stage: 'QF', t1: 'Netherlands', t2: 'Costa Rica', venue: 'stadiumaustralia', ko: '2023-08-11T21:00:00+10:00', score: [3, 1], cards: { t1: [{ color: 'yellow' }], t2: [] } },
]
const semi = { num: 101, stage: 'SF', t1: 'Spain', t2: 'Netherlands', venue: 'sydneyfootball', ko: '2023-08-15T20:00:00+10:00' }

const renderDetail = (props = {}) =>
  render(
    <FollowProvider>
      <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} allMatches={allMatches} {...props} />
    </FollowProvider>,
  )

describe('MatchDetail tale of the tape', () => {
  it('shows both teams’ tournament records for an upcoming knockout tie', () => {
    renderDetail()
    expect(screen.getByText('Tournament so far')).toBeInTheDocument()
    // Spain 2W (one on pens); the Netherlands 1W 1D.
    expect(screen.getByText('2–0–0 (1 on pens)')).toBeInTheDocument()
    expect(screen.getByText('1–1–0')).toBeInTheDocument()
    // FIFA 2023's last tie-breaker is a drawing of lots, so — unlike the Euro
    // sibling, and unlike the 2026 men's edition's FIFA ranking — there is no
    // ranking row to show as a tie-breaker's value.
    expect(screen.queryByText(/ranking/i)).toBeNull()
    // Card row appears (the Netherlands have card data) and is flagged best-effort.
    expect(screen.getByText('Cards')).toBeInTheDocument()
    expect(screen.getByText(/best-effort/)).toBeInTheDocument()
  })

  it('a played match shows the records the teams took INTO it, not today’s', () => {
    // Viewing the QF (Aug 11): only the group games (Jul 25/26) predate it —
    // the QF itself must not count toward its own tape.
    renderDetail({ match: allMatches[2] })
    expect(screen.getByText('Going into this match')).toBeInTheDocument()
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
    expect(screen.getByText('1–0–0')).toBeInTheDocument() // Spain: group win only
    expect(screen.getByText('0–1–0')).toBeInTheDocument() // USA: group draw only
    expect(screen.queryByText(/on pens/)).not.toBeInTheDocument()
  })

  it('does not render for a group match or a placeholder tie', () => {
    renderDetail({ match: allMatches[0] })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('skips placeholder knockout slots (no real teams yet)', () => {
    renderDetail({ match: { ...semi, t1: 'Winner Match 97', t2: 'Winner Match 98' } })
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })

  it('hides the records behind a reveal in spoiler-free mode', () => {
    renderDetail({ hideScores: true })
    expect(screen.queryByText('W–D–L')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('🙈 reveal team records'))
    expect(screen.getByText('W–D–L')).toBeInTheDocument()
  })

  it('renders without the section when allMatches is not provided', () => {
    render(
      <FollowProvider>
        <MatchDetail match={semi} tz="America/New_York" onClose={vi.fn()} />
      </FollowProvider>,
    )
    expect(screen.queryByText('Tournament so far')).not.toBeInTheDocument()
  })
})
