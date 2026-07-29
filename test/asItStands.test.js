import { describe, it, expect } from 'vitest'
import { projectKnockout } from '../src/utils/asItStands.js'
import { MATCHES as PLAYED, STAGE_ORDER } from '../src/data/matches.js'
import { TEAMS } from '../src/data/teams.js'
import { slotLabels, entryMatches, ENTRY_ROUND } from '../src/utils/slots.js'
import { computeQualification } from '../src/utils/qualification.js'
import { unscored, onlyGroupScores, groupTeams } from './helpers/tournament.js'

const MATCHES = unscored(PLAYED)
const GROUPS = Object.keys(TEAMS)

// With only the top two of each group advancing, the entry round is a fixed
// pairing of named slots — there is no cross-group third-place race and so no
// combination table (the Euro sibling needs UEFA's 15-row one here). These tests
// pin that structure and the projection built on it.
describe('the entry round is a closed set of winner/runner-up slots', () => {
  it('feeds every group winner and runner-up into a round-of-16 tie, exactly once', () => {
    const entries = entryMatches(MATCHES)
    expect(ENTRY_ROUND).toBe('R16')
    expect(entries).toHaveLength(8)

    const slots = entries.flatMap((m) => slotLabels(m))
    expect(slots).toHaveLength(16)
    // Every slot names a group position; none is a third-place pool.
    expect(slots.every((s) => /^(Winner|Runner-up) Group [A-H]$/.test(s))).toBe(true)
    expect(slots.some((s) => /3rd/.test(s))).toBe(false)

    for (const g of GROUPS) {
      expect(slots.filter((s) => s === `Winner Group ${g}`)).toHaveLength(1)
      expect(slots.filter((s) => s === `Runner-up Group ${g}`)).toHaveLength(1)
    }
  })

  it('never pairs a group with itself', () => {
    for (const m of entryMatches(MATCHES)) {
      const [a, b] = slotLabels(m).map((s) => s.slice(-1))
      expect(a, `match ${m.num} pairs group ${a} with itself`).not.toBe(b)
    }
  })

  it('has no stage between the group stage and the round of 16', () => {
    expect(STAGE_ORDER.indexOf('R16')).toBe(STAGE_ORDER.indexOf('Group') + 1)
  })
})

describe('projectKnockout', () => {
  it('returns a row per group even before a ball is kicked', () => {
    const { perGroup } = projectKnockout(MATCHES)
    expect(Object.keys(perGroup).sort()).toEqual(GROUPS)
    // No "settled" flag is offered: an unplayed group still ranks 1–4 via the
    // lots stand-in, so any such flag would read true here and mean nothing.
    expect(projectKnockout(MATCHES)).not.toHaveProperty('complete')
  })

  it('projects from the current standings of BOTH groups in a tie, however provisional', () => {
    // Only Group A has played. Its winner and runner-up are real; the opponents
    // are whoever currently tops Group C, which is still only the lots stand-in.
    // The projection is a snapshot of "as it stands", not a claim that it's
    // settled — so it names those provisional opponents rather than blanking
    // them, and they must come from the PAIRED group. That pairing is A-with-C,
    // not A-with-B: this bracket draws each group against the group two letters
    // along (see the note in scripts/fetch-tournament.mjs).
    const board = onlyGroupScores('A', [
      ['New Zealand', 'Norway', 2, 0],
      ['New Zealand', 'Switzerland', 2, 0],
      ['New Zealand', 'Philippines', 2, 0],
      ['Norway', 'Switzerland', 1, 0],
      ['Norway', 'Philippines', 1, 0],
      ['Switzerland', 'Philippines', 1, 0],
    ])
    const { perGroup } = projectKnockout(board)
    expect(perGroup.A.first.team).toBe('New Zealand')
    expect(perGroup.A.second.team).toBe('Norway')
    // The match numbers are structural, so they are known immediately.
    expect(perGroup.A.first.matchNum).toBe(49)
    expect(perGroup.A.second.matchNum).toBe(50)
    // M49 is "Winner A v Runner-up C", M50 "Winner C v Runner-up A".
    const groupC = groupTeams('C')
    expect(groupC).toContain(perGroup.A.first.opponent)
    expect(groupC).toContain(perGroup.A.second.opponent)
    // And it is genuinely Group C's provisional order, not an arbitrary name.
    const qc = computeQualification(board).groups.C
    expect(perGroup.A.first.opponent).toBe(qc[1].name) // runner-up C
    expect(perGroup.A.second.opponent).toBe(qc[0].name) // winner C
  })

  it('agrees with the standings it is derived from', () => {
    const { perGroup } = projectKnockout(PLAYED)
    const qual = computeQualification(PLAYED)
    for (const g of GROUPS) {
      expect(perGroup[g].first.team).toBe(qual.groups[g][0].name)
      expect(perGroup[g].second.team).toBe(qual.groups[g][1].name)
    }
  })

  it('reproduces the real round-of-16 line-up, with both sides of each tie agreeing', () => {
    const { perGroup } = projectKnockout(PLAYED)
    expect(perGroup.A.first).toMatchObject({ team: 'Switzerland', opponent: 'Spain', matchNum: 49 })
    expect(perGroup.B.first).toMatchObject({ team: 'Australia', opponent: 'Denmark', matchNum: 53 })
    expect(perGroup.C.first).toMatchObject({ team: 'Japan', opponent: 'Norway', matchNum: 50 })
    expect(perGroup.D.first).toMatchObject({ team: 'England', opponent: 'Nigeria', matchNum: 54 })
    expect(perGroup.E.first).toMatchObject({ team: 'Netherlands', opponent: 'South Africa', matchNum: 51 })
    expect(perGroup.F.first).toMatchObject({ team: 'France', opponent: 'Morocco', matchNum: 55 })
    expect(perGroup.G.first).toMatchObject({ team: 'Sweden', opponent: 'United States', matchNum: 52 })
    expect(perGroup.H.first).toMatchObject({ team: 'Colombia', opponent: 'Jamaica', matchNum: 56 })

    // Each tie is projected from both ends; the two views must be mirror images.
    const sides = Object.values(perGroup).flatMap((p) => [p.first, p.second])
    for (const s of sides) {
      const other = sides.find((o) => o !== s && o.matchNum === s.matchNum)
      expect(other, `match ${s.matchNum} projected from only one side`).toBeTruthy()
      expect(other.team).toBe(s.opponent)
      expect(other.opponent).toBe(s.team)
    }
  })

  it('reads slot labels from the static schedule, not from resolved live teams', () => {
    // Once a group is decided the live feed rewrites "Winner Group A" to
    // "Switzerland", which no longer parses as a slot. The projection must still
    // work — it looks the labels up by match number instead.
    const resolved = PLAYED.map((m) =>
      m.num === 49 ? { ...m, t1: 'Switzerland', t2: 'Spain', label1: undefined, label2: undefined } : m,
    )
    const { perGroup } = projectKnockout(resolved)
    expect(perGroup.A.first).toMatchObject({ team: 'Switzerland', matchNum: 49 })
  })
})
