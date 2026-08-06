import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NextMatch from '../src/components/NextMatch.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Group A's FINAL matchday: the last round of a group is played simultaneously,
// which is the only way two matches ever share a kickoff here. M17/M18 are
// matchday 2 and kick off 2.5 hours apart, so they would not exercise the stack.
const a = MATCHES.find((m) => m.num === 33) // Switzerland v New Zealand
const b = MATCHES.find((m) => m.num === 34) // Norway v Philippines
const live = (m) => ({ ...m, live: { clock: "30'", detail: '1st Half' }, score: [0, 0] })
const renderNM = (matches) =>
  render(
    <FollowProvider>
      <NextMatch matches={matches} tz="America/New_York" />
    </FollowProvider>,
  )

beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) }))
  localStorage.clear()
})

describe('NextMatch — stacking multiple live matches', () => {
  it('stacks every live match when none involve a followed team (rows jump on click)', () => {
    renderNM([live(a), live(b)])
    expect(screen.getByText(/Live now/)).toBeInTheDocument()
    expect(screen.getByText('2 matches')).toBeInTheDocument()
    const rows = document.querySelectorAll('.nm-live-row')
    expect(rows).toHaveLength(2)
    for (const name of [a.t1, a.t2, b.t1, b.t2]) expect(screen.getByText(name)).toBeInTheDocument()
    fireEvent.click(rows[0]) // exercises the row's jump handler (no day element → no-op)
  })

  it('shows only the followed team’s match (no stack) when a single followed team is live', () => {
    localStorage.setItem('wwc:followed', JSON.stringify([b.t1]))
    renderNM([live(a), live(b)])
    expect(document.querySelector('.nm-live-row')).toBeNull()
    expect(screen.getByText(b.t1)).toBeInTheDocument()
    expect(screen.queryByText(a.t1)).toBeNull()
  })

  it('stacks BOTH followed matches when two followed teams are live at once', () => {
    localStorage.setItem('wwc:followed', JSON.stringify([a.t1, b.t1]))
    renderNM([live(a), live(b)])
    expect(document.querySelectorAll('.nm-live-row')).toHaveLength(2)
    for (const name of [a.t1, b.t1]) expect(screen.getByText(name)).toBeInTheDocument()
  })
})

describe('NextMatch — stacking simultaneous upcoming matches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Before the 19:00 New Zealand (07:00 UTC) kickoff M33 and M34 share.
    vi.setSystemTime(new Date('2023-07-29T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stacks every upcoming match sharing the earliest kickoff when no favorite is set', () => {
    renderNM([a, b])
    expect(screen.getByText(/Next matches/)).toBeInTheDocument()
    expect(screen.getByText('2 at once')).toBeInTheDocument()
    const rows = document.querySelectorAll('.nm-live-row')
    expect(rows).toHaveLength(2)
    for (const name of [a.t1, a.t2, b.t1, b.t2]) expect(screen.getByText(name)).toBeInTheDocument()
    fireEvent.click(rows[0]) // exercises the row's jump handler (no day element → no-op)
  })

  it('shows only the followed team’s single match (no stack) even if another kicks off at the same time', () => {
    localStorage.setItem('wwc:followed', JSON.stringify([b.t1]))
    renderNM([a, b])
    expect(document.querySelector('.nm-live-row')).toBeNull()
    expect(screen.getByText(/Your next match/)).toBeInTheDocument()
    expect(screen.getByText(b.t1)).toBeInTheDocument()
    expect(screen.queryByText(a.t1)).toBeNull()
  })
})

// Both stacks label a group match "Group A" and anything else by its stage, and
// both fall back to a neutral mark when the flag table has never heard of the
// team — which is what a knockout row looks like the moment a feeder resolves to
// a name a data refresh has renamed. The single-card path already covers these;
// the stacked rows are a second, separate copy of the same markup.
describe('NextMatch — stacked rows for knockout matches', () => {
  const koPair = (extra = {}) => [
    { ...a, num: 9001, stage: 'QF', group: undefined, t1: 'Nowhere United', t2: 'Elsewhere City', ko: '2023-08-12T07:00:00Z', ...extra },
    { ...b, num: 9002, stage: 'SF', group: undefined, t1: 'Somewhere Rovers', t2: 'Anywhere Athletic', ko: '2023-08-12T07:00:00Z', ...extra },
  ]

  it('labels live stacked rows by stage and marks teams with no flag', () => {
    renderNM(koPair().map(live))
    const rows = document.querySelectorAll('.nm-live-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText(/Quarter-final ·/)).toBeInTheDocument()
    expect(screen.getByText(/Semi-final ·/)).toBeInTheDocument()
    const flags = [...document.querySelectorAll('.nm-flag')].map((n) => n.textContent)
    expect(flags).toEqual(['•', '•', '•', '•'])
  })

  it('labels upcoming stacked rows by stage, marks flagless teams, and counts whole days', () => {
    vi.useFakeTimers()
    // Three-and-a-bit days out, so the countdown shows a days figure the
    // same-day stack above never reaches.
    vi.setSystemTime(new Date('2023-08-09T00:00:00Z'))
    try {
      renderNM(koPair())
      expect(screen.getByText('2 at once')).toBeInTheDocument()
      expect(screen.getByText(/Quarter-final ·/)).toBeInTheDocument()
      const flags = [...document.querySelectorAll('.nm-flag')].map((n) => n.textContent)
      expect(flags).toEqual(['•', '•', '•', '•'])
      expect(document.querySelector('.nm-stack-bottom .nm-countdown').textContent).toMatch(/^3d/)
    } finally {
      vi.useRealTimers()
    }
  })
})
