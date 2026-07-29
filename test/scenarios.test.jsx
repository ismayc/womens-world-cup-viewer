import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeQualification } from '../src/utils/qualification.js'
import {
  remainingGroupMatches,
  applyScenarioPicks,
  unpickedCount,
  possibleOrderings,
  pickOutcome,
  groupStageArchived,
  stageArchived,
  PICK_SCORES,
} from '../src/utils/scenarios.js'
import ScenariosView from '../src/components/ScenariosView.jsx'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

// Every group complete EXCEPT C, which still has its final matchday (37, 38)
// to play — see the fixture, which deliberately freezes the group whose order is
// still genuinely open at that point.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

// A second snapshot with TWO groups still in play, one of which already has a
// locked round-of-16 tie: New Zealand have won Group A with a game to spare and
// Group C is complete, so Match 49 (Winner A v Runner-up C) is already fixed —
// while Group H has not kicked a ball. Groups B–G are all finished, which leaves
// exactly 8 games open (Group A's last 2 + Group H's 6).
const LOCKED_A = Object.assign(
  { 1: [3, 0], 33: [0, 3], 3: [0, 0], 34: [0, 0] },
  ...['B', 'C', 'D', 'E', 'F', 'G'].map((g) => FINAL_GROUP_RESULTS[g].scores),
)
const lockedSnapshot = MATCHES.map((m) => (LOCKED_A[m.num] ? { ...m, score: LOCKED_A[m.num] } : m))

describe('scenarios util', () => {
  it('lists only unplayed group games, grouped by group', () => {
    const rem = remainingGroupMatches(snapshot)
    // Only Group C is incomplete, and it has its final 2 games left.
    expect(Object.keys(rem)).toEqual(['C'])
    expect(rem['C']).toHaveLength(2)
    expect(unpickedCount(snapshot, {})).toBe(2)
  })

  it('applies a scoreline pick without mutating input', () => {
    const before = MATCHES.find((m) => m.num === 37)
    const out = applyScenarioPicks(snapshot, { 37: [0, 2] })
    expect(out.find((m) => m.num === 37).score).toEqual([0, 2])
    expect(before.score).toBeUndefined() // original untouched
    expect(unpickedCount(snapshot, { 37: [0, 2] })).toBe(1)
  })

  it('reads the win/draw/loss category of a scoreline', () => {
    expect(pickOutcome(PICK_SCORES.home)).toBe('home')
    expect(pickOutcome([2, 2])).toBe('draw')
    expect(pickOutcome([0, 3])).toBe('away')
    expect(pickOutcome(undefined)).toBeNull()
  })

  it('a chosen result changes the projected standings', () => {
    // Group C, match 37 (Japan v Spain): give Japan the win and they gain points.
    const base = computeQualification(snapshot).groups['C'].find((r) => r.name === 'Japan')
    const after = computeQualification(applyScenarioPicks(snapshot, { 37: PICK_SCORES.home })).groups[
      'C'
    ].find((r) => r.name === 'Japan')
    expect(after.Pts).toBe(base.Pts + 3)
  })

  it('counts distinct reachable final standings, collapsing to 1 when fully set', () => {
    // Group C has 2 games left -> several possible orders; pinning both exact
    // scorelines leaves exactly one final standing.
    const open = possibleOrderings('C', snapshot)
    expect(open.count).toBeGreaterThan(1)
    expect(open.decided).toBe(false)
    const set = applyScenarioPicks(snapshot, { 37: [0, 1], 38: [2, 0] })
    expect(possibleOrderings('C', set)).toEqual({ count: 1, decided: true })
  })
})

describe('groupStageArchived', () => {
  const allDone = MATCHES.map((m) => (m.stage === 'Group' ? { ...m, score: m.score || [1, 0] } : m))

  it('is false while any group game is unplayed', () => {
    expect(groupStageArchived(MATCHES)).toBe(false)
  })
  it('is false while a group game is still live (not yet settled)', () => {
    const oneLive = allDone.map((m) => (m.num === 1 ? { ...m, live: { clock: "70'" } } : m))
    expect(groupStageArchived(oneLive)).toBe(false)
  })
  it('is true as soon as every group game is final', () => {
    expect(groupStageArchived(allDone)).toBe(true)
  })
})

describe('stageArchived (generic, per-stage)', () => {
  const qfDone = MATCHES.map((m) => (m.stage === 'QF' ? { ...m, score: [1, 0] } : m))

  it('is false while any of the stage’s games is unplayed', () => {
    expect(stageArchived(MATCHES, 'QF')).toBe(false)
  })
  it('is false while one of the stage’s games is still live', () => {
    const oneLive = qfDone.map((m) => (m.num === 57 ? { ...m, live: { clock: "70'" } } : m))
    expect(stageArchived(oneLive, 'QF')).toBe(false)
  })
  it('is true once every game in the stage is final', () => {
    expect(stageArchived(qfDone, 'QF')).toBe(true)
  })
  it('is false for a stage with no games', () => {
    expect(stageArchived(MATCHES, 'Nope')).toBe(false)
  })
})

describe('ScenariosView', () => {
  it('renders a card per group still in play and reacts to a pick', () => {
    render(<ScenariosView matches={lockedSnapshot} />)
    expect(screen.getByText('8 games still open')).toBeInTheDocument()
    // One card per incomplete group — and none for the two that are done.
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group H')).toBeInTheDocument()
    for (const g of ['B', 'C', 'D', 'E', 'F', 'G']) {
      expect(screen.queryByText(`Group ${g}`), `Group ${g} is complete`).toBeNull()
    }
    // Each in-play group reports how many final orders are still possible.
    expect(screen.getAllByText(/possible orders/).length).toBeGreaterThan(0)

    // Picking a result decrements the open-game counter and reveals Clear.
    const firstWin = screen.getAllByTitle(/win$/i)[0]
    fireEvent.click(firstWin)
    expect(screen.getByText('7 games still open')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear picks'))
    expect(screen.getByText('8 games still open')).toBeInTheDocument()
  })

  it('marks a locked projected round-of-16 matchup with a confirmed checkmark', () => {
    // New Zealand have won Group A and Group C is finished, so Group A's "1st"
    // projected line is confirmed without any picks — even though Group A itself
    // still has two games left. (A pairs with C in this bracket, not with B.)
    render(<ScenariosView matches={lockedSnapshot} />)
    const card = screen.getByText('Group A').closest('.sc-card')
    expect(card.querySelector('.sc-r32-lock')).toBeInTheDocument()
    // The bare checkmark carries an accessible label but no "Matchup confirmed" text.
    expect(within(card).getByLabelText('Matchup confirmed')).toBeInTheDocument()
    expect(within(card).queryByText(/Matchup confirmed/)).toBeNull()
    // A wide-open group shows no confirmed matchup yet.
    const open = screen.getByText('Group H').closest('.sc-card')
    expect(open.querySelector('.sc-r32-lock')).toBeNull()
  })

  it('exposes goal steppers once a result is set, and they adjust the score', () => {
    render(<ScenariosView matches={lockedSnapshot} />)
    // Set the first fixture to a home win, which reveals the score steppers.
    fireEvent.click(screen.getAllByTitle(/win$/i)[0])
    expect(screen.getByText('1–0')).toBeInTheDocument()
    // Bump the home side to 2 goals.
    fireEvent.click(screen.getAllByLabelText(/goals plus$/i)[0])
    expect(screen.getByText('2–0')).toBeInTheDocument()
  })

  it('shows the all-groups-decided empty state', () => {
    // Every group already complete → no scenarios.
    const allDone = MATCHES.map((m) =>
      m.stage === 'Group' ? { ...m, score: m.score || [1, 0] } : m,
    )
    render(<ScenariosView matches={allDone} />)
    expect(screen.getByText(/Every group is decided/i)).toBeInTheDocument()
  })
})
