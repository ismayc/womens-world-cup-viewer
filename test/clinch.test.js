import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'
import {
  computeClinch,
  resolveClinchedSlots,
  resolveRunnerUpSlots,
  groupRunnersUp,
  groupWinners,
  newlyClinched,
  clinchHeadline,
  clinchBadge,
  groupPositionBounds,
} from '../src/utils/clinch.js'

const GROUPS = Object.keys(TEAMS)

// Apply a { matchNum: [g1, g2] } map onto a clone of the real schedule.
function withScores(scoreByNum) {
  return MATCHES.map((m) => (scoreByNum[m.num] ? { ...m, score: scoreByNum[m.num] } : m))
}

describe('clinch — within a single group', () => {
  // Group A fixtures: M1 New Zealand v Norway, M3 Philippines v Switzerland,
  // M17 New Zealand v Philippines, M18 Switzerland v Norway,
  // M33 Switzerland v New Zealand, M34 Norway v Philippines.
  // NOTE the orientations — two of the six are the reverse of what the round
  // order suggests, so a score written the wrong way round silently tests a
  // different scenario.
  it('flags a guaranteed group winner as won-group', () => {
    // New Zealand win both their played matches; nobody else can reach 6 points.
    const status = computeClinch(
      withScores({
        1: [3, 0], // New Zealand 3–0 Norway
        33: [0, 3], // Switzerland 0–3 New Zealand
        3: [0, 0], // Philippines 0–0 Switzerland
        34: [0, 0], // Norway 0–0 Philippines
      }),
    )
    expect(status['New Zealand']).toBe('won-group')
    // The other three are still contesting 2nd — never falsely "through" or "out".
    expect(status['Philippines']).toBeNull()
    expect(status['Norway']).toBeNull()
    expect(status['Switzerland']).toBeNull()
  })

  it('flags two teams clear of the field as top2 (through, group order open)', () => {
    // New Zealand and the Philippines both 6 pts; Norway/Switzerland can reach 3.
    const status = computeClinch(
      withScores({
        1: [1, 0], // New Zealand 1–0 Norway
        33: [0, 1], // Switzerland 0–1 New Zealand
        3: [1, 0], // Philippines 1–0 Switzerland
        34: [0, 1], // Norway 0–1 Philippines
      }),
    )
    expect(status['New Zealand']).toBe('top2')
    expect(status['Philippines']).toBe('top2')
    // This format has NO best-third route, so being locked out of the top two IS
    // elimination — the same board in the Euro sibling would leave these two
    // alive on a cross-group third-place bound. This is the difference worth
    // asserting: only two teams per group go through, full stop.
    expect(status['Norway']).toBe('eliminated')
    expect(status['Switzerland']).toBe('eliminated')
  })

  it('flags a team locked into EXACTLY 2nd as the group runner-up (a game still to play)', () => {
    // New Zealand win all three → 9 pts, 1st locked. Norway are also done: beat
    // the Philippines and Switzerland, lost only to New Zealand → 6 pts. The one
    // fixture left (Philippines v Switzerland) can lift neither above 3 — so
    // Norway is pinned to 2nd while a match is still outstanding.
    const status = computeClinch(
      withScores({
        1: [3, 0], // New Zealand 3–0 Norway
        33: [0, 3], // Switzerland 0–3 New Zealand
        17: [3, 0], // New Zealand 3–0 Philippines
        34: [3, 0], // Norway 3–0 Philippines
        18: [0, 3], // Switzerland 0–3 Norway
        // M3 Philippines v Switzerland still to play.
      }),
    )
    expect(status['New Zealand']).toBe('won-group')
    expect(status['Norway']).toBe('runner-up')
    // Whoever wins the dead rubber tops out at 3 points — both are already out.
    expect(status['Switzerland']).toBe('eliminated')
    expect(status['Philippines']).toBe('eliminated')
  })

  it('treats a live (in-progress) match as undecided, not a final result', () => {
    // Scores that, if all final, clinch the group for New Zealand (6 pts; nobody
    // else can reach 6). M33 is New Zealand's *current* match, LIVE at 0–3.
    const scores = {
      1: [3, 0], // New Zealand 3–0 Norway (final)
      3: [0, 0], // Philippines 0–0 Switzerland (final)
      34: [0, 0], // Norway 0–0 Philippines (final)
      33: [0, 3], // Switzerland 0–3 New Zealand (LIVE — running score)
    }
    // If the live game were counted as final, New Zealand would read "won-group".
    expect(computeClinch(withScores(scores))['New Zealand']).toBe('won-group')

    // But while it's live, the result isn't settled — no clinch yet.
    const live = withScores(scores).map((m) =>
      m.num === 33 ? { ...m, live: { clock: "60'", detail: '' } } : m,
    )
    expect(computeClinch(live)['New Zealand']).toBeNull()
  })

  it('eliminates a team that has played out its group with nothing left to catch', () => {
    // Group C: Zambia have played all three and lost the lot — to Japan, to
    // Spain and to Costa Rica. With 0 points and no games left they cannot be
    // caught up from below, so they are locked into 4th while the group's other
    // places are still open. (Synthetic: Zambia actually beat Costa Rica 3–1.)
    const status = computeClinch(
      withScores({
        6: [0, 5], // Zambia 0–5 Japan
        20: [5, 0], // Spain 5–0 Zambia
        38: [3, 0], // Costa Rica 3–0 Zambia
        21: [1, 1], // Japan 1–1 Costa Rica
      }),
    )
    expect(status['Zambia']).toBe('eliminated')
    expect(status['Costa Rica']).toBeNull()
    expect(status['Spain']).toBeNull()
    expect(status['Japan']).toBeNull()
  })

  it('eliminates on points alone when the group is too open to enumerate exactly', () => {
    // Only three of Group A's six are played, so the scoreline enumeration is
    // over budget (the engine's budget covers two remaining matches, not three)
    // and the sound points-only bound has to carry the verdict. Norway have
    // played all three and lost all three; the other three are already on 3
    // points apiece, so no result can lift Norway off the bottom.
    const status = computeClinch(
      withScores({
        1: [3, 0], // New Zealand 3–0 Norway
        34: [0, 3], // Norway 0–3 Philippines
        18: [3, 0], // Switzerland 3–0 Norway
        // M3, M17, M33 all still to play.
      }),
    )
    expect(status['Norway']).toBe('eliminated')
    // Everyone else is wide open — the fallback must not over-claim either way.
    expect(status['New Zealand']).toBeNull()
    expect(status['Philippines']).toBeNull()
    expect(status['Switzerland']).toBeNull()
  })

  it('does not claim a clinch while a rival can still overtake on points', () => {
    // Only matchday 1 played: far too open for anything to be locked.
    const status = computeClinch(
      withScores({
        1: [1, 0], // New Zealand 1–0 Norway
        3: [0, 0], // Philippines 0–0 Switzerland
      }),
    )
    for (const t of TEAMS['A']) expect(status[t.name]).toBeNull()
  })
})

describe('resolveClinchedSlots — fill knockout placeholders in the data', () => {
  it('rewrites "Winner Group X" to the clinched winner in every match (so all views agree)', () => {
    const clinch = { 'New Zealand': 'won-group' }
    expect(groupWinners(clinch)).toEqual({ A: 'New Zealand' })

    const resolved = resolveClinchedSlots(MATCHES, clinch)
    // M49's first side was the "Winner Group A" placeholder — now the data
    // itself says New Zealand, so the bracket AND the detail modal agree.
    expect(resolved.find((m) => m.num === 49).t1).toBe('New Zealand')
    // Unclinched slots untouched. M50 is Winner C v Runner-up A — the entry
    // round pairs A with C here, not with B as the Copa sibling does.
    expect(resolved.find((m) => m.num === 50).t1).toBe('Winner Group C')
    expect(resolved.some((m) => m.t1 === 'Winner Group A' || m.t2 === 'Winner Group A')).toBe(false)
  })

  it('returns the original array untouched when nothing is clinched', () => {
    expect(resolveClinchedSlots(MATCHES, {})).toBe(MATCHES)
  })
})

describe('resolveRunnerUpSlots — fill the runner-up once a group is fully final', () => {
  // Group A all six matches final: New Zealand 9, Norway 6, Switzerland 3,
  // Philippines 0 — so Norway is the unambiguous runner-up (no tie-breaker).
  const groupAFinal = { 1: [2, 0], 33: [0, 2], 17: [2, 0], 34: [2, 0], 18: [0, 2], 3: [0, 2] }

  it('rewrites "Runner-up Group A" to the real team in every match', () => {
    const matches = withScores(groupAFinal)
    expect(groupRunnersUp(matches)).toEqual({ A: 'Norway' })

    const resolved = resolveRunnerUpSlots(matches)
    // M50 = "Winner Group C" vs "Runner-up Group A".
    const m26 = resolved.find((m) => m.num === 50)
    expect(m26.t2).toBe('Norway')
    // Group C isn't final, so its winner slot stays a placeholder.
    expect(m26.t1).toBe('Winner Group C')
    expect(resolved.some((m) => m.t1 === 'Runner-up Group A' || m.t2 === 'Runner-up Group A')).toBe(
      false,
    )
  })

  it('does NOT resolve while any group match is still live (score provisional)', () => {
    const live = withScores(groupAFinal).map((m) =>
      m.num === 17 ? { ...m, live: { clock: "70'", detail: '' } } : m,
    )
    expect(groupRunnersUp(live)).toEqual({})
    expect(resolveRunnerUpSlots(live).find((m) => m.num === 50).t2).toBe('Runner-up Group A')
  })

  it('returns the original array untouched when no group has settled', () => {
    expect(resolveRunnerUpSlots(MATCHES)).toBe(MATCHES)
  })
})

describe('newlyClinched — announce what a result settled (for the email)', () => {
  it('reports a team the latest result pushed over the line, with phrasing', () => {
    // Group A part-played; then M33 (New Zealand beat Switzerland) is the
    // freshly-synced result that wins New Zealand the group.
    const before = withScores({ 1: [2, 0], 3: [1, 1], 34: [1, 1] })
    const after = withScores({ 1: [2, 0], 3: [1, 1], 34: [1, 1], 33: [0, 1] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'New Zealand', group: 'A', status: 'won-group' })
    expect(clinchHeadline({ team: 'New Zealand', group: 'A', status: 'won-group' })).toBe(
      '🥇 New Zealand have WON Group A',
    )
    expect(clinchHeadline({ team: 'Australia', group: 'B', status: 'runner-up' })).toBe(
      '🥈 Australia are THROUGH as Group B RUNNERS-UP',
    )
  })

  it('phrases every status, and falls back rather than dropping an unknown one', () => {
    // This knockout starts at the ROUND OF 16, so "through" must not say
    // quarter-finals the way the Copa sibling's does.
    expect(clinchHeadline({ team: 'Spain', group: 'C', status: 'top2' })).toBe(
      '✅ Spain are THROUGH to the round of 16 (top two of Group C)',
    )
    expect(clinchHeadline({ team: 'Zambia', group: 'C', status: 'eliminated' })).toBe(
      '❌ Zambia are ELIMINATED from Group C',
    )
    // An unrecognised status still names the team rather than vanishing.
    expect(clinchHeadline({ team: 'Denmark', group: 'D', status: 'third' })).toBe(
      'Denmark (Group D): third',
    )
  })

  it('does not repeat a clinch that was already true before the result', () => {
    const settled = withScores({ 1: [2, 0], 3: [2, 1], 18: [1, 1], 17: [1, 0] })
    expect(newlyClinched(settled, settled)).toEqual([])
  })
})

describe('clinch — a complete group stage', () => {
  // Build a complete, tie-free group stage with a strict 9/6/3/0 hierarchy in
  // every group (team index 0 strongest … 3 weakest). Exactly two advance per
  // group with no cross-group comparison, so every group resolves on its own and
  // the expected picture is the same in all EIGHT.
  function buildComplete() {
    const score = {}
    for (const g of GROUPS) {
      const idx = Object.fromEntries(TEAMS[g].map((t, k) => [t.name, k]))
      for (const m of MATCHES) {
        if (m.stage !== 'Group' || m.group !== g) continue
        score[m.num] = idx[m.t1] < idx[m.t2] ? [1, 0] : [0, 1]
      }
    }
    return withScores(score)
  }

  it('matches the final qualification picture for every team', () => {
    const status = computeClinch(buildComplete())
    for (const g of GROUPS) {
      const [first, second, third, fourth] = TEAMS[g].map((t) => t.name)
      expect(status[first]).toBe('won-group')
      expect(status[second]).toBe('runner-up')
      // No best-thirds route here: 3rd is out exactly like 4th.
      expect(status[third]).toBe('eliminated')
      expect(status[fourth]).toBe('eliminated')
    }
  })
})

describe('clinchBadge', () => {
  it('maps each status to a distinct badge, and unknown → null', () => {
    expect(clinchBadge('won-group')).toMatchObject({ cls: 'c-won', label: '🥇', text: 'Won group' })
    expect(clinchBadge('runner-up')).toMatchObject({
      cls: 'c-silver',
      label: '🥈',
      text: 'Group runner-up',
    })
    expect(clinchBadge('top2')).toMatchObject({ cls: 'c-in', text: 'Through' })
    // 'third' is a Euro / men's-World-Cup status with no counterpart here — if it
    // ever leaks in from a sibling it must NOT render as a qualification badge.
    expect(clinchBadge('third')).toBeNull()
    expect(clinchBadge('eliminated')).toMatchObject({ cls: 'c-out', text: 'Eliminated' })
    expect(clinchBadge(null)).toBeNull()
    expect(clinchBadge(undefined)).toBeNull()
    expect(clinchBadge('weird')).toBeNull()
  })
})

describe('groupWinners', () => {
  it('maps only won-group teams to their group letter', () => {
    const winners = groupWinners({
      'New Zealand': 'won-group',
      Spain: 'won-group',
      Australia: 'top2',
      Zambia: 'eliminated',
    })
    // New Zealand→A, Spain→C; top2/eliminated excluded.
    expect(winners).toEqual({ A: 'New Zealand', C: 'Spain' })
  })
  it('returns an empty object when nothing is clinched', () => {
    expect(groupWinners({})).toEqual({})
    expect(groupWinners(null)).toEqual({})
  })
})

describe('resolveClinchedSlots — leaves runner-up slots alone', () => {
  it('fills only the clinched Winner Group X slot, not the runner-up slots', () => {
    const resolved = resolveClinchedSlots(MATCHES, {
      'New Zealand': 'won-group',
      Spain: 'won-group',
    })
    const find = (num) => resolved.find((m) => m.num === num)
    expect(find(49).t1).toBe('New Zealand') // Winner Group A
    expect(find(50).t1).toBe('Spain') // Winner Group C
    // Runner-up placeholders are untouched. A pairs with C in this bracket.
    expect(find(49).t2).toBe('Runner-up Group C')
    expect(find(50).t2).toBe('Runner-up Group A')
  })
})

describe('groupPositionBounds', () => {
  it('reads 1–4 for every team while nothing has been played (points fallback)', () => {
    // Six remaining games per group is far over the scoreline budget, so every
    // bound comes from the sound points-only pass — and with no results at all,
    // every position is genuinely open.
    const bounds = groupPositionBounds(MATCHES)
    for (const g of GROUPS) {
      for (const t of TEAMS[g]) expect(bounds[t.name]).toEqual({ best: 1, worst: 4 })
    }
  })

  it('is exact (goal difference and head-to-head included) when the group is enumerable', () => {
    // Group A with two games left (81² scorelines — enumerable): Norway played
    // all three (1 point — lost to New Zealand and Switzerland, drew with the
    // Philippines), New Zealand beat the Philippines; M3 (PHI v SUI) and
    // M33 (SUI v NZL) remain.
    const bounds = groupPositionBounds(
      withScores({ 1: [2, 0], 34: [1, 1], 18: [1, 0], 17: [1, 0] }),
    )
    expect(bounds['New Zealand']).toEqual({ best: 1, worst: 2 })
    expect(bounds['Switzerland']).toEqual({ best: 1, worst: 3 })
    expect(bounds['Philippines']).toEqual({ best: 2, worst: 4 })
    expect(bounds['Norway']).toEqual({ best: 3, worst: 4 })
  })

  it('locks every position once a group is complete — the real 2023 Group A order', () => {
    // The committed schedule carries the finished edition, so every group is
    // final: Switzerland won Group A on 7 points, Norway edged New Zealand for
    // 2nd on goal difference (both 4 points), the Philippines finished 4th.
    const bounds = groupPositionBounds(PLAYED)
    expect(bounds['Switzerland']).toEqual({ best: 1, worst: 1 })
    expect(bounds['Norway']).toEqual({ best: 2, worst: 2 })
    expect(bounds['New Zealand']).toEqual({ best: 3, worst: 3 })
    expect(bounds['Philippines']).toEqual({ best: 4, worst: 4 })
  })
})

describe('newlyClinched — detects new verdicts and upgrades', () => {
  it('reports a newly eliminated team', () => {
    // Zambia lose to Japan, then to Spain and Costa Rica — three defeats, no
    // games left, so the last result locks them into 4th.
    const before = withScores({ 6: [0, 5], 21: [1, 1] })
    const after = withScores({ 6: [0, 5], 21: [1, 1], 20: [5, 0], 38: [3, 0] })
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'Zambia', group: 'C', status: 'eliminated' })
  })

  it('reports an upgrade from top2 to won-group', () => {
    // before: New Zealand & the Philippines both through (top2).
    // after: New Zealand has won it outright.
    const before = withScores({ 1: [1, 0], 33: [0, 1], 3: [1, 0], 34: [0, 1] })
    const after = withScores({ 1: [3, 0], 33: [0, 3], 3: [0, 0], 34: [0, 0] })
    expect(computeClinch(before)['New Zealand']).toBe('top2')
    const changes = newlyClinched(before, after)
    expect(changes).toContainEqual({ team: 'New Zealand', group: 'A', status: 'won-group' })
  })
})
