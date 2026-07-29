import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'
import { eliminationStatus, survivingTeams, isAlive } from '../src/utils/eliminationCheck.js'
import { computeClinch } from '../src/utils/clinch.js'

const ALL_NAMES = Object.values(TEAMS).flat().map((t) => t.name)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule. Matches
// left out of the map stay scoreless = "still to play".
function withScores(map) {
  return MATCHES.map((m) => (map[m.num] ? { ...m, score: map[m.num] } : m))
}

// Every group's real final result, from the frozen official fixture.
const REAL_FINAL = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))

describe('eliminationStatus — against the real 2023 group stage', () => {
  it('leaves exactly the sixteen real round-of-16 teams alive', () => {
    const status = eliminationStatus(withScores(REAL_FINAL))
    // The sixteen who actually reached the Round of 16, from the committed
    // knockout data rather than restated by hand.
    const realR16Teams = [...new Set(PLAYED.filter((m) => m.stage === 'R16').flatMap((m) => [m.t1, m.t2]))]
    expect(realR16Teams).toHaveLength(16)
    expect(survivingTeams(withScores(REAL_FINAL)).sort()).toEqual([...realR16Teams].sort())
    for (const t of realR16Teams) expect(status[t], t).toBe('alive')
    for (const t of ALL_NAMES.filter((n) => !realR16Teams.includes(n))) {
      expect(status[t], t).toBe('eliminated')
    }
  })

  it('matches the clinch engine: nobody is eliminated here but alive there', () => {
    // The two engines answer different questions off the same enumeration, so
    // they must never contradict each other.
    const matches = withScores(GROUP_STAGE_MD3)
    const elim = eliminationStatus(matches)
    const clinch = computeClinch(matches)
    for (const t of ALL_NAMES) {
      if (clinch[t] === 'eliminated') expect(elim[t], t).toBe('eliminated')
      if (elim[t] === 'alive') expect(clinch[t], t).not.toBe('eliminated')
    }
  })
})

describe('eliminationStatus — mid-tournament verdicts', () => {
  it('reads the open group correctly: qualified sides alive, bottom two already out', () => {
    // The frozen mid-tournament snapshot: Groups A, B and D–H are complete and
    // Group C has matches 37 and 38 outstanding.
    //
    // Group C is NOT "everyone still alive". Japan and Spain are both on 6
    // points against two sides on 0 who can reach at most 3, so the pair have
    // already qualified even though their ORDER is undecided — while Zambia and
    // Costa Rica are mathematically out with games still to play. Asserting
    // "the whole group is alive" here would be simply wrong.
    const status = eliminationStatus(withScores(GROUP_STAGE_MD3))
    expect(status['Japan']).toBe('alive')
    expect(status['Spain']).toBe('alive')
    expect(status['Zambia']).toBe('eliminated')
    expect(status['Costa Rica']).toBe('eliminated')
    // …and the groups that ARE finished already read their real verdicts.
    expect(status['Philippines']).toBe('eliminated')
    expect(status['Republic of Ireland']).toBe('eliminated')
    expect(status['Vietnam']).toBe('eliminated')
    // Exactly the sixteen who really went through are still standing.
    expect(survivingTeams(withScores(GROUP_STAGE_MD3))).toHaveLength(16)
  })

  it('eliminates a team locked out of the top two with games still to play', () => {
    // Group E: Vietnam have played and lost all three, so two group matches
    // remain but their fate no longer depends on either — the other three are
    // all on at least 3 points already.
    //
    // Two open matches, not three, is deliberate: the enumeration budget covers
    // a group with two games left but not three, and beyond it the module
    // reports "alive" rather than guessing (see the conservative case below).
    // A three-open version of this test passes vacuously.
    const status = eliminationStatus(withScores({ 9: [3, 0], 24: [2, 0], 42: [0, 7], 10: [1, 0] }))
    expect(status['Vietnam']).toBe('eliminated')
    for (const t of ['Portugal', 'United States', 'Netherlands']) expect(status[t], t).toBe('alive')
  })

  it('eliminates on goal difference, not just on points — the exact check earning its keep', () => {
    // Group A with only Norway v Philippines (M34) left. New Zealand have won
    // the group on 9. Switzerland have played out all three of their games on 3
    // points and GD −2, and both Norway and the Philippines can also finish on
    // 3 — so a POINTS-ONLY bound would keep Switzerland alive. Goal difference
    // is what rules them out: in every completion of M34 the side that ends
    // level with them on points does so with a better GD (a Norway win lifts
    // Norway above −2; a Norway loss by enough to drop the Philippines below −2
    // is exactly a Norway win the other way round).
    //
    // FIFA puts overall GD immediately after points (the Euro puts head-to-head
    // there first), so this is decided before any H2H comparison.
    const matches = withScores({ 1: [2, 0], 3: [2, 0], 17: [2, 0], 18: [2, 0], 33: [0, 2] })
    const status = eliminationStatus(matches)
    expect(status['Switzerland']).toBe('eliminated')
    // The other three are genuinely still contesting second place.
    expect(status['New Zealand']).toBe('alive')
    expect(status['Norway']).toBe('alive')
    expect(status['Philippines']).toBe('alive')
  })
})

describe('eliminationStatus — conservative when it cannot enumerate', () => {
  it('claims nothing on a blank board (scoreline space over budget)', () => {
    // Six unplayed matches per group is far beyond the enumeration budget, so
    // the module must stay silent rather than guess. Never a false elimination.
    const status = eliminationStatus(MATCHES)
    expect(Object.keys(status).sort()).toEqual([...ALL_NAMES].sort())
    for (const t of ALL_NAMES) expect(status[t], t).toBe('alive')
    expect(survivingTeams(MATCHES)).toHaveLength(ALL_NAMES.length)
  })
})

describe('isAlive — single-team helper', () => {
  it('agrees with the full status map, both ways', () => {
    const matches = withScores(REAL_FINAL)
    expect(isAlive(matches, 'Spain')).toBe(true)
    expect(isAlive(matches, 'Vietnam')).toBe(false)
    // An unknown name has no verdict, so it is not "eliminated" — the helper
    // must not invent one.
    expect(isAlive(matches, 'Nobody FC')).toBe(true)
  })
})
