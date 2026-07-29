import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { computeClinch } from '../src/utils/clinch.js'
import { decideMatch, resolveKnockoutSlots, resolveBracket } from '../src/utils/bracketResolve.js'
import { unscored } from './helpers/tournament.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

const GROUPS = Object.keys(TEAMS)
// This format's knockout slots come in exactly two shapes: a group slot (filled
// by the clinch engine) and a feed slot (filled from a finished tie). There is
// no "3rd Group X/Y/Z" form — that is the Euro's best-thirds race, which the
// 2023 Women's World Cup has no equivalent of: eight groups, top two only.
const ANY_PLACEHOLDER = /^(Winner|Runner-up) Group [A-H]$|^(Winner|Loser) Match \d+$/
const ALL_NAMES = new Set(Object.values(TEAMS).flat().map((t) => t.name))

// This edition is finished, so the committed schedule already holds every
// result. Tests about "before anything is played" must ask for a blank board.
const BLANK = unscored()

// A complete, tie-free group stage: a strict 9/6/3/0 hierarchy in every group
// (team index 0 strongest … 3 weakest), so each group's top two are unambiguous
// without invoking a single tie-breaker.
function buildComplete() {
  const score = {}
  for (const g of GROUPS) {
    const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
    for (const m of BLANK) {
      if (m.stage !== 'Group' || m.group !== g) continue
      score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
    }
  }
  return BLANK.map((m) => (score[m.num] ? { ...m, score: score[m.num] } : m))
}

describe('decideMatch — winner/loser of a knockout tie', () => {
  it('takes the side with more goals', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1] })).toEqual({ winner: 'A', loser: 'B' })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 3] })).toEqual({ winner: 'B', loser: 'A' })
  })

  it('breaks a draw on penalties', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1], pens: [5, 4] })).toEqual({
      winner: 'A', loser: 'B',
    })
    expect(decideMatch({ t1: 'A', t2: 'B', score: [0, 0], pens: [2, 4] })).toEqual({
      winner: 'B', loser: 'A',
    })
  })

  it('returns null when not yet settled (drawn w/o pens, live, voided, unplayed)', () => {
    expect(decideMatch({ t1: 'A', t2: 'B', score: [1, 1] })).toBeNull() // drawn, no shootout yet
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], live: { clock: "70'" } })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B', score: [2, 1], voided: true })).toBeNull()
    expect(decideMatch({ t1: 'A', t2: 'B' })).toBeNull() // no score
  })

  it('decides the real 2023 shootouts from the committed data', () => {
    const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))
    // EVERY knockout tie here plays extra time before penalties, so `pens`
    // always comes WITH `aet`. That is the exact opposite of the Copa América
    // sibling, where only the Final had extra time and `pens` without `aet` was
    // correct — do not copy this expectation between the two in either
    // direction. Three ties reached a shootout: two in the Round of 16 and one
    // quarter-final.
    expect(decideMatch(byNum[52])).toEqual({ winner: 'Sweden', loser: 'United States' })
    expect(decideMatch(byNum[54])).toEqual({ winner: 'England', loser: 'Nigeria' })
    expect(decideMatch(byNum[59])).toEqual({ winner: 'Australia', loser: 'France' })
    for (const num of [52, 54, 59]) {
      expect(byNum[num].aet, `M${num} must be aet as well as pens`).toBe(true)
      expect(Array.isArray(byNum[num].pens)).toBe(true)
    }
    // Match 57 is the other side of that coin: extra time with NO shootout, so
    // `aet` with no `pens`, decided by the score alone.
    expect(byNum[57].aet).toBe(true)
    expect(byNum[57].pens).toBeUndefined()
    expect(decideMatch(byNum[57])).toEqual({ winner: 'Spain', loser: 'Netherlands' })
  })
})

describe('resolveKnockoutSlots — propagate winners up the bracket', () => {
  it('feeds a round’s winners into the next round', () => {
    // Real topology: QF 57 is "Winner Match 49 v Winner Match 51".
    const ms = [
      { num: 49, stage: 'R16', t1: 'Switzerland', t2: 'Spain', score: [1, 1], aet: true, pens: [4, 2] },
      { num: 51, stage: 'R16', t1: 'Netherlands', t2: 'South Africa', score: [0, 1] },
      { num: 57, stage: 'QF', t1: 'Winner Match 49', t2: 'Winner Match 51' },
    ]
    const r = resolveKnockoutSlots(ms)
    const m57 = r.find((m) => m.num === 57)
    expect([m57.t1, m57.t2]).toEqual(['Switzerland', 'South Africa'])
  })

  it('routes semi-final winners into the final', () => {
    const ms = [
      { num: 61, stage: 'SF', t1: 'Spain', t2: 'Sweden', score: [2, 1] },
      { num: 62, stage: 'SF', t1: 'Australia', t2: 'England', score: [1, 3] },
      { num: 64, stage: 'Final', t1: 'Winner Match 61', t2: 'Winner Match 62' },
    ]
    const r = resolveKnockoutSlots(ms)
    const final = r.find((m) => m.num === 64)
    expect([final.t1, final.t2]).toEqual(['Spain', 'England'])
  })

  it('routes the beaten semi-finalists into the third-place play-off', () => {
    // The LOSER feed form, which the Euro sibling never exercises — it dropped
    // the third-place play-off after 1980. FIFA still plays it, as match 63.
    const ms = [
      { num: 61, stage: 'SF', t1: 'Spain', t2: 'Sweden', score: [2, 1] },
      { num: 62, stage: 'SF', t1: 'Australia', t2: 'England', score: [1, 3] },
      { num: 63, stage: '3rd', t1: 'Loser Match 61', t2: 'Loser Match 62' },
    ]
    const third = resolveKnockoutSlots(ms).find((m) => m.num === 63)
    expect([third.t1, third.t2]).toEqual(['Sweden', 'Australia'])
  })

  it('leaves a slot as a placeholder while its tie is unsettled', () => {
    const ms = [
      { num: 49, stage: 'R16', t1: 'Switzerland', t2: 'Spain', score: [1, 1] }, // drawn, no pens
      { num: 57, stage: 'QF', t1: 'Winner Match 49', t2: 'Winner Match 51' },
    ]
    const r = resolveKnockoutSlots(ms)
    expect(r.find((m) => m.num === 57).t1).toBe('Winner Match 49')
    // Original array returned untouched when nothing resolves.
    expect(resolveKnockoutSlots(ms)).toEqual(ms)
  })

  it('does NOT advance a LIVE knockout — even one with a leading score — until full time', () => {
    const live = [
      { num: 49, stage: 'R16', t1: 'Switzerland', t2: 'Spain', score: [1, 2], live: { clock: "70'" } },
      { num: 57, stage: 'QF', t1: 'Winner Match 49', t2: 'Winner Match 51' },
    ]
    const r = resolveKnockoutSlots(live)
    expect(r.find((m) => m.num === 57).t1).toBe('Winner Match 49')
    expect(resolveKnockoutSlots(live)).toEqual(live) // nothing resolved → untouched

    // The instant the SAME score goes final (live cleared), it propagates.
    const finalized = live.map((m) => (m.num === 49 ? { ...m, live: undefined } : m))
    expect(resolveKnockoutSlots(finalized).find((m) => m.num === 57).t1).toBe('Spain')
  })
})

describe('resolveBracket — full pipeline', () => {
  it('leaves all knockout placeholders intact before anything is played', () => {
    expect(resolveBracket(BLANK, {})).toBe(BLANK)
  })

  it('fills the entire Round of 16 once the group stage is complete', () => {
    const complete = buildComplete()
    const clinch = computeClinch(complete)
    const resolved = resolveBracket(complete, clinch)
    const r16 = resolved.filter((m) => m.stage === 'R16')
    expect(r16).toHaveLength(8)
    for (const m of r16) {
      expect(ANY_PLACEHOLDER.test(m.t1)).toBe(false)
      expect(ANY_PLACEHOLDER.test(m.t2)).toBe(false)
    }
  })

  it('plays a full bracket end-to-end (incl. a shootout) to a single champion', () => {
    const clinch = computeClinch(buildComplete())
    let cur = resolveBracket(buildComplete(), clinch)

    // Repeatedly: assign a result to every ready-but-unplayed knockout tie, then
    // re-resolve so winners feed the next round. Match 49 and a semi-final go to
    // penalties, exercising the shootout path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        if (m.num === 49 || m.num === 61) return { ...m, score: [1, 1], aet: true, pens: [4, 2] }
        return { ...m, score: [1, 0] } // home side advances
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    // Sixteen knockout matches: 8 R16 + 4 QF + 2 SF + the third-place play-off
    // + the Final.
    const ko = cur.filter((m) => m.stage !== 'Group')
    expect(ko).toHaveLength(16)
    for (const m of ko) {
      expect(ALL_NAMES.has(m.t1), `M${m.num} t1`).toBe(true)
      expect(ALL_NAMES.has(m.t2), `M${m.num} t2`).toBe(true)
    }
    expect(decideMatch(cur.find((m) => m.stage === 'Final'))).not.toBeNull()
    // The play-off resolved too, from the LOSER feeds rather than the winners.
    expect(decideMatch(cur.find((m) => m.stage === '3rd'))).not.toBeNull()
  })

  it('propagates REAL round-of-16 winners through the bracket (frozen group results)', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const seeded = BLANK.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(seeded)
    let cur = resolveBracket(seeded, clinch)

    // Knockout sim on the REAL group outcome: home side advances, except M49,
    // which goes to a shootout to exercise the penalty path.
    for (let pass = 0; pass < 10; pass++) {
      let changed = false
      cur = cur.map((m) => {
        if (m.stage === 'Group' || Array.isArray(m.score)) return m
        if (!ALL_NAMES.has(m.t1) || !ALL_NAMES.has(m.t2)) return m
        changed = true
        return m.num === 49 ? { ...m, score: [1, 1], aet: true, pens: [4, 2] } : { ...m, score: [1, 0] }
      })
      cur = resolveBracket(cur, clinch)
      if (!changed) break
    }

    const byNum = Object.fromEntries(cur.map((m) => [m.num, m]))
    // The real group stage sends Switzerland (winner A) against Spain (runner-up
    // C) in M49 and Japan (winner C) against Norway (runner-up A) in M50 — the
    // genuine 2023 pairings. QF 57 is "Winner Match 49 v Winner Match 51", so
    // the M49 shootout winner meets the M51 winner there.
    expect([byNum[49].t1, byNum[49].t2]).toEqual(['Switzerland', 'Spain'])
    expect([byNum[50].t1, byNum[50].t2]).toEqual(['Japan', 'Norway'])
    expect([byNum[57].t1, byNum[57].t2]).toEqual(['Switzerland', 'Netherlands'])
    // …and the two beaten semi-finalists drop into the third-place play-off.
    expect([byNum[63].t1, byNum[63].t2]).toEqual(['Japan', 'England'])

    for (const m of cur.filter((x) => x.stage !== 'Group')) {
      expect(ALL_NAMES.has(m.t1) && ALL_NAMES.has(m.t2), `M${m.num}`).toBe(true)
    }
    expect(decideMatch(byNum[64])).not.toBeNull()
  })
})
