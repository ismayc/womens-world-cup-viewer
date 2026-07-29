import { describe, it, expect } from 'vitest'
import {
  rankGroup,
  computeQualification,
  groupComplete,
  rowStatus,
  ADVANCING_PER_GROUP,
  byLots,
} from '../src/utils/qualification.js'
import { TEAMS } from '../src/data/teams.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored, onlyGroupScores, groupTeams } from './helpers/tournament.js'

// This edition is finished, so the committed schedule ships with every result in
// it. Tie-breaker tests need a board they control, so they build one from an
// unscored schedule; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

// Group A — New Zealand, Norway, Philippines, Switzerland — is the workhorse for
// the tie-breaker cases. `onlyGroupScores` matches each result to its fixture by
// TEAM PAIR, so these boards never name a match number and stay correct however
// the schedule orders the six.
const scoreA = (results) => onlyGroupScores('A', results)

describe('rankGroup — FIFA 2023 tie-breakers', () => {
  it('orders by points when points are distinct', () => {
    const rows = rankGroup('A', scoreA([
      ['New Zealand', 'Norway', 2, 0],
      ['New Zealand', 'Switzerland', 3, 0],
      ['New Zealand', 'Philippines', 1, 0],
      ['Norway', 'Switzerland', 2, 1],
      ['Philippines', 'Norway', 0, 1],
      ['Switzerland', 'Philippines', 2, 0],
    ]))
    // 9 / 6 / 3 / 0 — strictly by points, so no tie-breaker is consulted at all.
    expect(rows.map((r) => r.name)).toEqual(['New Zealand', 'Norway', 'Switzerland', 'Philippines'])
    expect(rows[0].Pts).toBe(9)
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
  })

  // THE signature difference from the sibling Euro viewer AND from the 2026 men's
  // World Cup: FIFA 2023 applies OVERALL goal difference before head-to-head,
  // while both of those do the reverse. Get it backwards and any group where two
  // level teams met is silently misordered.
  it('applies OVERALL goal difference BEFORE head-to-head', () => {
    const rows = rankGroup('A', scoreA([
      ['Norway', 'New Zealand', 1, 0], // H2H: Norway beat New Zealand
      ['New Zealand', 'Switzerland', 5, 0],
      ['New Zealand', 'Philippines', 5, 0], // …but NZ run up a far better overall GD
      ['Norway', 'Switzerland', 1, 0],
      ['Philippines', 'Norway', 1, 0],
      ['Switzerland', 'Philippines', 1, 0],
    ]))
    const nzl = rows.find((r) => r.name === 'New Zealand')
    const nor = rows.find((r) => r.name === 'Norway')
    expect([nzl.Pts, nor.Pts]).toEqual([6, 6])
    expect(nzl.GD).toBeGreaterThan(nor.GD)
    // New Zealand first despite losing the head-to-head. Under UEFA's order (and
    // the 2026 men's order) Norway would be first — that inversion is the whole
    // point of this test.
    expect(rows.slice(0, 2).map((r) => r.name)).toEqual(['New Zealand', 'Norway'])
  })

  it('falls to head-to-head only once points, GD and goals are all level', () => {
    const rows = rankGroup('A', scoreA([
      ['Philippines', 'New Zealand', 1, 0], // H2H: the Philippines beat New Zealand
      ['New Zealand', 'Norway', 1, 0],
      ['New Zealand', 'Switzerland', 1, 0],
      ['Norway', 'Switzerland', 1, 0],
      ['Philippines', 'Norway', 1, 0],
      ['Switzerland', 'Philippines', 1, 0],
    ]))
    const [first, second] = rows
    expect([first.Pts, first.GD, first.GF]).toEqual([second.Pts, second.GD, second.GF])
    expect([first.name, second.name]).toEqual(['Philippines', 'New Zealand'])
  })

  // New Zealand and Norway finish identical on points, GD and goals scored, and
  // drew head-to-head — so only fair play points and then a drawing of lots are
  // left. The tests below share this board.
  const DEAD_EVEN = [
    ['New Zealand', 'Norway', 0, 0], // head-to-head draw
    ['Switzerland', 'New Zealand', 0, 1],
    ['New Zealand', 'Philippines', 0, 1],
    ['Norway', 'Switzerland', 1, 0],
    ['Philippines', 'Norway', 1, 0],
    ['Philippines', 'Switzerland', 1, 0],
  ]

  // Attach cards inside the New Zealand–Norway match, whichever way round the
  // real fixture lists the two sides.
  const withCards = (perTeam) =>
    scoreA(DEAD_EVEN).map((m) => {
      const isPair =
        m.stage === 'Group' && m.group === 'A' &&
        [m.t1, m.t2].includes('New Zealand') && [m.t1, m.t2].includes('Norway')
      if (!isPair) return m
      const side = (team) => (m.t1 === team ? 't1' : 't2')
      const cards = {}
      for (const [team, list] of Object.entries(perTeam)) cards[side(team)] = list
      return { ...m, cards }
    })

  it('breaks a dead-even tie by a drawing of lots when no cards are recorded', () => {
    const rows = rankGroup('A', scoreA(DEAD_EVEN))
    const nzl = rows.find((r) => r.name === 'New Zealand')
    const nor = rows.find((r) => r.name === 'Norway')
    expect([nzl.Pts, nzl.GD, nzl.GF]).toEqual([nor.Pts, nor.GD, nor.GF])
    expect(nzl.conduct).toBe(nor.conduct)
    // Nothing computable is left, so the stable stand-in for the draw applies.
    expect(nzl.rank).toBeLessThan(nor.rank)
    expect(byLots('New Zealand', 'Norway')).toBeLessThan(0)
  })

  it('uses fair play points before the drawing of lots', () => {
    const rows = rankGroup('A', withCards({ 'New Zealand': [{ color: 'yellow' }] }))
    const nzl = rows.find((r) => r.name === 'New Zealand')
    const nor = rows.find((r) => r.name === 'Norway')
    expect([nzl.Pts, nzl.GD, nzl.GF]).toEqual([nor.Pts, nor.GD, nor.GF]) // still level on goals
    expect(nzl.conduct).toBe(-1)
    expect(nor.conduct).toBe(0)
    // One yellow is enough to reverse the order the lots stand-in produced above.
    expect(nor.rank).toBeLessThan(nzl.rank)
  })

  it('scores fair play points additively — a red is 4 yellows, not infinite', () => {
    // FIFA's scale is ADDITIVE (yellow −1, direct red −4), so one red is BETTER
    // than five yellows. The Copa sibling ranks fewest reds first and only then
    // fewest yellows, which would put the red team second here — copying that
    // encoding into this repo silently inverts every card-decided tie.
    const rows = rankGroup('A', withCards({
      'New Zealand': [{ color: 'red' }],
      Norway: Array.from({ length: 5 }, () => ({ color: 'yellow' })),
    }))
    const nzl = rows.find((r) => r.name === 'New Zealand')
    const nor = rows.find((r) => r.name === 'Norway')
    expect(nzl.conduct).toBe(-4)
    expect(nor.conduct).toBe(-5)
    expect(nzl.rank).toBeLessThan(nor.rank)
  })

  it('with no results, ranks all four teams 1–4 by the lots stand-in', () => {
    const rows = rankGroup('A', [])
    expect(rows.map((r) => r.name)).toEqual(['New Zealand', 'Norway', 'Philippines', 'Switzerland'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.every((r) => r.Pts === 0)).toBe(true)
  })

  it('ignores a voided match', () => {
    const board = scoreA([['New Zealand', 'Norway', 3, 0]]).map((m) =>
      m.stage === 'Group' && m.group === 'A' && m.score ? { ...m, voided: true } : m,
    )
    expect(rankGroup('A', board).every((r) => r.P === 0)).toBe(true)
  })
})

describe('computeQualification', () => {
  it('has eight groups and nothing complete before a ball is kicked', () => {
    const q = computeQualification(MATCHES)
    expect(Object.keys(q.groups)).toHaveLength(8)
    expect(q.allComplete).toBe(false)
    expect(Object.values(q.completion).every((c) => c === false)).toBe(true)
  })

  it('every group has its four teams ranked 1–4', () => {
    const q = computeQualification(MATCHES)
    for (const g of Object.keys(TEAMS)) {
      expect(q.groups[g].map((r) => r.rank)).toEqual([1, 2, 3, 4])
      expect(q.groups[g].map((r) => r.name).sort()).toEqual([...groupTeams(g)].sort())
    }
  })

  it('flags completion per group and overall', () => {
    const scored = MATCHES.map((m) =>
      m.stage === 'Group' && m.group === 'A' ? { ...m, score: [1, 0] } : m,
    )
    const q = computeQualification(scored)
    expect(q.completion.A).toBe(true)
    expect(q.completion.B).toBe(false)
    expect(q.allComplete).toBe(false)
    expect(computeQualification(PLAYED).allComplete).toBe(true)
  })

  it('exposes no best-thirds machinery — only the top two of each group advance', () => {
    const q = computeQualification(PLAYED)
    expect(ADVANCING_PER_GROUP).toBe(2)
    expect(q).not.toHaveProperty('thirds')
    expect(q).not.toHaveProperty('bestThirds')
    // Eight groups × two = the sixteen round-of-16 sides.
    const advancing = Object.values(q.groups).flatMap((rows) => rows.slice(0, ADVANCING_PER_GROUP))
    expect(advancing).toHaveLength(16)
  })

  it("reproduces the real Women's World Cup 2023 group results from the committed data", () => {
    const q = computeQualification(PLAYED)
    const topTwo = Object.fromEntries(
      Object.entries(q.groups).map(([g, rows]) => [g, [rows[0].name, rows[1].name]]),
    )
    expect(topTwo).toEqual({
      A: ['Switzerland', 'Norway'],
      B: ['Australia', 'Nigeria'],
      C: ['Japan', 'Spain'],
      D: ['England', 'Denmark'],
      E: ['Netherlands', 'United States'],
      F: ['France', 'Jamaica'],
      G: ['Sweden', 'South Africa'],
      H: ['Colombia', 'Morocco'],
    })
    // Group H is the sharpest real-data proof of the ORDER. Morocco BEAT Colombia
    // 1–0, yet Colombia finished above them: both ended on 6 points, and overall
    // goal difference (+2 vs −4) is applied first. Under the Euro's (and the 2026
    // men's) head-to-head-first order Morocco would top the pair, so the two
    // criteria genuinely disagree here — unlike a tie that comes out the same
    // whichever order you use.
    const h = q.groups.H
    const col = h.find((r) => r.name === 'Colombia')
    const mar = h.find((r) => r.name === 'Morocco')
    expect(col.Pts).toBe(mar.Pts)
    expect(col.GD).toBeGreaterThan(mar.GD)
    expect(col.rank).toBeLessThan(mar.rank)
    const meeting = PLAYED.find(
      (m) =>
        m.stage === 'Group' &&
        [m.t1, m.t2].includes('Colombia') &&
        [m.t1, m.t2].includes('Morocco'),
    )
    const colGoals = meeting.t1 === 'Colombia' ? meeting.score[0] : meeting.score[1]
    const marGoals = meeting.t1 === 'Morocco' ? meeting.score[0] : meeting.score[1]
    expect(marGoals).toBeGreaterThan(colGoals) // Morocco won the meeting and still finished below
  })
})

describe('rowStatus', () => {
  it('says nothing until the group is complete, then in/out by position', () => {
    const qual = { completion: { A: false }, allComplete: false }
    expect(rowStatus({ rank: 1 }, 'A', qual)).toBeNull()
    const done = { completion: { A: true }, allComplete: false }
    expect(rowStatus({ rank: 1 }, 'A', done)).toBe('in')
    expect(rowStatus({ rank: 2 }, 'A', done)).toBe('in')
    expect(rowStatus({ rank: 3 }, 'A', done)).toBe('out')
    expect(rowStatus({ rank: 4 }, 'A', done)).toBe('out')
  })
})

describe('groupComplete', () => {
  it('is true only once all six group matches are scored', () => {
    const aMatches = MATCHES.filter((m) => m.stage === 'Group' && m.group === 'A')
    expect(aMatches).toHaveLength(6)
    expect(groupComplete('A', [])).toBe(false)
    const five = aMatches.slice(0, 5).map((m) => ({ ...m, score: [1, 0] }))
    expect(groupComplete('A', five)).toBe(false)
    expect(groupComplete('A', aMatches.map((m) => ({ ...m, score: [1, 0] })))).toBe(true)
  })
})
