import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { rankGroup } from '../src/utils/qualification.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { FINAL_GROUP_RESULTS, OFFICIAL_R16 } from './fixtures/final-group-results.js'

// Only the frozen group results are known here — the knockout sides must be
// DERIVED, not read back off the committed schedule, or the test proves nothing.
function fromGroupResultsOnly() {
  const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
  const matches = unscored().map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
  return resolveBracket(matches, computeClinch(matches))
}

// Replays each group's verified final result through the ranking engine and
// asserts the official finishing order — so a tie-breaker regression can't
// quietly send the wrong team into the knockouts.
describe('final group standings — locked against official results', () => {
  const groups = Object.entries(FINAL_GROUP_RESULTS)

  it('guards all eight groups', () => {
    expect(groups.map(([g]) => g).sort()).toEqual(Object.keys(TEAMS).sort())
  })

  for (const [group, rec] of groups) {
    it(`Group ${group} finishes in the official order`, () => {
      // The locked scores must reference exactly that group's six matches.
      const groupNums = MATCHES.filter((m) => m.stage === 'Group' && m.group === group)
        .map((m) => m.num)
        .sort((a, b) => a - b)
      expect(Object.keys(rec.scores).map(Number).sort((a, b) => a - b)).toEqual(groupNums)

      const matches = MATCHES.map((m) =>
        rec.scores[m.num] ? { ...m, score: rec.scores[m.num] } : m,
      )
      expect(rankGroup(group, matches).map((r) => r.name)).toEqual(rec.order)
    })
  }

  it('ranks Colombia above Morocco on goal difference despite losing to them', () => {
    // The sharpest tie-break in the tournament, and the reason this fixture
    // exists. Colombia and Morocco both finished Group H on 6 points. Morocco
    // BEAT Colombia 1–0 in Match 48, so under a head-to-head-first ordering
    // Morocco finishes above them and both sides of the bracket change. FIFA
    // compares overall goal difference first, and Colombia's +2 beats −4.
    //
    // Unlike a drawn head-to-head, this cannot come out right by luck: the two
    // criteria point at DIFFERENT teams, so only the correct order passes.
    const rows = rankGroup('H', MATCHES)
    const col = rows.find((r) => r.name === 'Colombia')
    const mar = rows.find((r) => r.name === 'Morocco')
    expect(col.Pts).toBe(mar.Pts)
    expect(col.GD).toBeGreaterThan(mar.GD)

    // …and the head-to-head genuinely favours Morocco, so the two criteria
    // disagree. If this stops being true the assertion above loses its teeth.
    const h2h = MATCHES.find((m) => m.num === 48)
    expect([h2h.t1, h2h.t2]).toEqual(['Morocco', 'Colombia'])
    expect(h2h.score[0]).toBeGreaterThan(h2h.score[1])

    expect(rows.map((r) => r.name)).toEqual(FINAL_GROUP_RESULTS.H.order)
  })
})

// The independent check on the orders above. OFFICIAL_R16 comes from the
// committed schedule's own t1/t2 — ESPN's scoreboard structure, never
// rankGroup's output and never the standings endpoint the orders came from — so
// deriving the same pairings from nothing but the group scores is what proves
// the finishing orders are right rather than merely self-consistent.
describe('round-of-16 line-up — locked against the official bracket', () => {
  it('resolves to the official Round-of-16 matchups from the group results alone', () => {
    const byNum = Object.fromEntries(fromGroupResultsOnly().map((m) => [m.num, m]))
    for (const [num, pair] of Object.entries(OFFICIAL_R16)) {
      expect([byNum[num].t1, byNum[num].t2], `R16 match ${num}`).toEqual(pair)
    }
  })

  it('leaves no placeholder in the Round of 16 once the group stage is complete', () => {
    for (const m of fromGroupResultsOnly().filter((m) => m.stage === 'R16')) {
      expect(/Group|3rd|Match/.test(`${m.t1} ${m.t2}`), `unresolved R16 M${m.num}`).toBe(false)
    }
  })

  it('sends exactly the sixteen real round-of-16 teams through, and nobody else', () => {
    // Eight groups × top two. There is no best-third route in this format, so a
    // third-placed team appearing here would mean the engine invented one.
    const resolved = fromGroupResultsOnly()
    const through = resolved.filter((m) => m.stage === 'R16').flatMap((m) => [m.t1, m.t2])
    expect(through.sort()).toEqual(Object.values(OFFICIAL_R16).flat().sort())
    expect(new Set(through).size).toBe(16)
    const thirdsAndFourths = Object.values(FINAL_GROUP_RESULTS).flatMap((r) => r.order.slice(2))
    for (const t of thirdsAndFourths) expect(through, `${t} should be eliminated`).not.toContain(t)
  })
})
