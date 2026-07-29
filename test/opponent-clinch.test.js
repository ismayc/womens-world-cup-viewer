import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { lockedOpponent } from '../src/utils/opponentClinch.js'
import { computeClinch } from '../src/utils/clinch.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

// A real mid-tournament snapshot: Groups A, B and D–H complete, Group C with its
// final matchday (Matches 37 and 38) still to play — so the two-group matchup
// math is exercised against an authentic configuration.
const snapshot = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

describe('lockedOpponent — knockout opponent clinch', () => {
  const clinch = computeClinch(snapshot)

  it('locks a tie between two settled groups while another is still playing', () => {
    // The Netherlands won Group E and South Africa finished second in Group G,
    // so Winner E v Runner-up G (Match 51) is fixed — even though Group C still
    // has two games left. This format needs only those two groups to agree:
    // with no best-third slot, no third group's results can ever redirect this
    // tie. (The Euro sibling has to hold a whole cross-group thirds race open
    // before it can say the same.)
    expect(lockedOpponent(snapshot, 'Netherlands', clinch)).toEqual({
      opponent: 'South Africa',
      matchNum: 51,
    })
    // …and it reads the same from the other side of the tie.
    expect(lockedOpponent(snapshot, 'South Africa', clinch)).toEqual({
      opponent: 'Netherlands',
      matchNum: 51,
    })
  })

  it('locks a winner vs runner-up tie the same way', () => {
    // Colombia won Group H, Jamaica finished second in Group F → Match 56.
    expect(lockedOpponent(snapshot, 'Colombia', clinch)).toEqual({
      opponent: 'Jamaica',
      matchNum: 56,
    })
  })

  it('does NOT lock a team whose opposite group is still being played', () => {
    // Switzerland won Group A, but their Round-of-16 tie (Match 49) faces Group
    // C's runner-up, and Group C has not finished — so the opponent stays open.
    expect(clinch['Switzerland']).toBe('won-group')
    expect(lockedOpponent(snapshot, 'Switzerland', clinch)).toBeNull()
    // Norway (runner-up A) faces Group C's winner in Match 50 — also open.
    expect(lockedOpponent(snapshot, 'Norway', clinch)).toBeNull()
  })

  it('does NOT lock a team that has not fixed its own finishing slot', () => {
    // Japan and Spain are both through but only as "top2": until Group C's last
    // matchday is played either could finish first or second, which are
    // different Round-of-16 ties. Advancing is not the same as knowing where you
    // land — and this group is the clearest case of it in the tournament, since
    // both sides qualified two matchdays early and still met to decide the order.
    expect(clinch['Japan']).toBe('top2')
    expect(clinch['Spain']).toBe('top2')
    expect(lockedOpponent(snapshot, 'Japan', clinch)).toBeNull()
    expect(lockedOpponent(snapshot, 'Spain', clinch)).toBeNull()
    // An eliminated team never has one.
    expect(lockedOpponent(snapshot, 'Zambia', clinch)).toBeNull()
    // Neither does a name that isn't in the tournament.
    expect(lockedOpponent(snapshot, 'Nobody FC', clinch)).toBeNull()
  })

  it('locks every round-of-16 tie once the whole group stage is final', () => {
    const all = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const done = MATCHES.map((m) => (all[m.num] ? { ...m, score: all[m.num] } : m))
    const c = computeClinch(done)
    // The eight real Round-of-16 ties, read back out of the slot map.
    expect(lockedOpponent(done, 'Switzerland', c)).toEqual({ opponent: 'Spain', matchNum: 49 })
    expect(lockedOpponent(done, 'Japan', c)).toEqual({ opponent: 'Norway', matchNum: 50 })
    expect(lockedOpponent(done, 'Netherlands', c)).toEqual({ opponent: 'South Africa', matchNum: 51 })
    expect(lockedOpponent(done, 'Sweden', c)).toEqual({ opponent: 'United States', matchNum: 52 })
    expect(lockedOpponent(done, 'Australia', c)).toEqual({ opponent: 'Denmark', matchNum: 53 })
    expect(lockedOpponent(done, 'England', c)).toEqual({ opponent: 'Nigeria', matchNum: 54 })
    expect(lockedOpponent(done, 'France', c)).toEqual({ opponent: 'Morocco', matchNum: 55 })
    expect(lockedOpponent(done, 'Colombia', c)).toEqual({ opponent: 'Jamaica', matchNum: 56 })
  })

  it('locks nothing before the tournament starts', () => {
    // Called without a precomputed clinch map, so the default argument runs too.
    expect(lockedOpponent(MATCHES, 'Spain')).toBeNull()
  })
})
