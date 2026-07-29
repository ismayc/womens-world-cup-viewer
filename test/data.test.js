import { describe, it, expect } from 'vitest'
import { MATCHES, STAGE_ORDER } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'
import { TEAMS, ALL_TEAMS } from '../src/data/teams.js'
import { BRACKET } from '../src/utils/bracket.js'
import { slotLabels } from '../src/utils/slots.js'
import {
  OFFICIAL_KO,
  OFFICIAL_STADIUM,
  OFFICIAL_GROUPS,
  OFFICIAL_MATCH_GROUP,
  OFFICIAL_ROUND,
  SCHEDULED_NOT_ACTUAL,
} from './fixtures/official-kickoffs.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'

// There is no single tournament timezone to restate kickoffs in — the venues
// span +08:00 to +12:00 — so the fixture carries full ISO instants with each
// venue's own offset and `ko` is compared to them directly.

// The fixture's join key: kickoff date + sorted team pair.
const officialKey = (m) => `${m.ko.slice(0, 10)}|${[m.t1, m.t2].sort().join('|')}`

describe('schedule data integrity', () => {
  it('has all 64 matches', () => {
    expect(MATCHES).toHaveLength(64)
  })

  it('has the correct stage distribution', () => {
    const counts = MATCHES.reduce((a, m) => ((a[m.stage] = (a[m.stage] || 0) + 1), a), {})
    expect(counts).toEqual({ Group: 48, R16: 8, QF: 4, SF: 2, '3rd': 1, Final: 1 })
  })

  it('has a third-place play-off (FIFA still plays one)', () => {
    // The sibling Euro viewer asserts the opposite — UEFA dropped it after 1980.
    expect(MATCHES.filter((m) => m.stage === '3rd')).toHaveLength(1)
    expect(BRACKET.third).toBeTruthy()
  })

  it('has unique match numbers 1–64', () => {
    const nums = MATCHES.map((m) => m.num).sort((a, b) => a - b)
    expect(new Set(nums).size).toBe(64)
    expect(nums[0]).toBe(1)
    expect(nums[63]).toBe(64)
  })

  it('numbers the knockout rounds as FIFA does (R16 49–56, QF 57–60, SF 61–62, 3rd 63, Final 64)', () => {
    const nums = (stage) =>
      MATCHES.filter((m) => m.stage === stage).map((m) => m.num).sort((a, b) => a - b)
    expect(nums('R16')).toEqual([49, 50, 51, 52, 53, 54, 55, 56])
    expect(nums('QF')).toEqual([57, 58, 59, 60])
    expect(nums('SF')).toEqual([61, 62])
    expect(nums('3rd')).toEqual([63])
    expect(nums('Final')).toEqual([64])
  })

  it('references only known venues', () => {
    expect(MATCHES.every((m) => VENUES[m.venue])).toBe(true)
  })

  it('has a parseable kickoff instant for every match', () => {
    expect(MATCHES.every((m) => !Number.isNaN(new Date(m.ko).getTime()))).toBe(true)
  })

  it('stores every kickoff against its OWN venue’s offset, and uses all four', () => {
    // The structural difference from every sibling viewer: there is no single
    // tournament timezone here. Australia and New Zealand span four southern-
    // winter offsets, so a match carries its venue's, not the organiser's.
    // A regression that normalised everything to one offset would pass a
    // "parseable kickoff" check and fail here.
    const offsets = MATCHES.map((m) => m.ko.slice(-6))
    const bad = MATCHES.filter((m) => !/[+-]\d{2}:\d{2}$/.test(m.ko)).map((m) => `M${m.num}: ${m.ko}`)
    expect(bad).toEqual([])
    expect([...new Set(offsets)].sort()).toEqual(['+08:00', '+09:30', '+10:00', '+12:00'])

    // …and each match's offset is the one its own venue actually keeps.
    const mismatched = MATCHES.filter((m) => {
      const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: VENUES[m.venue].tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(new Date(m.ko))
      const g = (t) => local.find((p) => p.type === t).value
      const hour = g('hour') === '24' ? '00' : g('hour')
      return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}` !== m.ko.slice(0, 16)
    }).map((m) => `M${m.num} ${m.ko} vs ${VENUES[m.venue].tz}`)
    expect(mismatched).toEqual([])
  })

  it('carries a unique ESPN event id for every match', () => {
    const missing = MATCHES.filter((m) => !/^\d+$/.test(m.espnId || '')).map((m) => m.num)
    expect(missing).toEqual([])
    expect(new Set(MATCHES.map((m) => m.espnId)).size).toBe(64)
  })

  it('is sorted chronologically', () => {
    for (let i = 1; i < MATCHES.length; i++) {
      expect(new Date(MATCHES[i].ko).getTime()).toBeGreaterThanOrEqual(
        new Date(MATCHES[i - 1].ko).getTime(),
      )
    }
  })

  it('every group match references a real team in its group', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      const names = TEAMS[m.group].map((t) => t.name)
      expect(names).toContain(m.t1)
      expect(names).toContain(m.t2)
    }
  })

  it('has 32 teams across 8 groups', () => {
    expect(Object.keys(TEAMS)).toHaveLength(8)
    expect(ALL_TEAMS).toHaveLength(32)
  })

  it('matches the official group draw', () => {
    for (const g of Object.keys(OFFICIAL_GROUPS)) {
      const ours = TEAMS[g].map((t) => t.name).sort()
      expect(ours, `group ${g}`).toEqual([...OFFICIAL_GROUPS[g]].sort())
    }
  })

  it('has 10 venues', () => {
    expect(Object.keys(VENUES)).toHaveLength(10)
  })

  it('bracket covers every knockout match exactly once', () => {
    const bracketNums = [
      ...BRACKET.left.R16, ...BRACKET.left.QF, ...BRACKET.left.SF,
      ...BRACKET.final, ...BRACKET.third,
      ...BRACKET.right.SF, ...BRACKET.right.QF, ...BRACKET.right.R16,
    ].sort((a, b) => a - b)
    const knockoutNums = MATCHES.filter((m) => m.stage !== 'Group')
      .map((m) => m.num)
      .sort((a, b) => a - b)
    expect(bracketNums).toEqual(knockoutNums)
  })

  it('exposes stages in tournament order', () => {
    expect(STAGE_ORDER).toEqual(['Group', 'R16', 'QF', 'SF', '3rd', 'Final'])
  })
})

// The committed schedule is shaped from ESPN; the fixture is stated by FIFA.
// These assertions are the cross-check between the two.
describe('schedule agrees with the independently-sourced official fixture', () => {
  it('covers exactly the same 64 matches', () => {
    expect(MATCHES.map(officialKey).sort()).toEqual(Object.keys(OFFICIAL_KO).sort())
  })

  it('kicks off every match at the officially published instant', () => {
    const wrong = MATCHES.filter((m) => {
      const k = officialKey(m)
      // Any match that legitimately differs is recorded in SCHEDULED_NOT_ACTUAL.
      const expected = SCHEDULED_NOT_ACTUAL[k]?.actual ?? OFFICIAL_KO[k]
      return m.ko !== expected
    }).map((m) => `M${m.num} ${m.t1} v ${m.t2}: ${m.ko} ≠ ${OFFICIAL_KO[officialKey(m)]}`)
    expect(wrong).toEqual([])
  })

  it('records no deliberate divergence from the published fixture', () => {
    // The sibling Copa viewer has exactly one (its Final kicked off ~75 minutes
    // late and the archive keeps the ACTUAL time). FIFA and ESPN agree on all 64
    // here, so this is empty — asserted rather than assumed, so that a future
    // divergence has to be written down and explained instead of silently
    // slipping past the kickoff check above via the `?? ` fallback.
    expect(SCHEDULED_NOT_ACTUAL).toEqual({})
  })

  it('plays every match in the officially published stadium', () => {
    // FIFA's official, unsponsored stadium names — the commercial names ESPN
    // uses (Accor, Sky, Suncorp, AAMI, HBF, …) never appear in the venue table.
    const wrong = MATCHES.filter((m) => VENUES[m.venue].name !== OFFICIAL_STADIUM[officialKey(m)]).map(
      (m) => `M${m.num}: ${VENUES[m.venue].name} ≠ ${OFFICIAL_STADIUM[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })

  it('assigns every match to the officially published round', () => {
    const wrong = MATCHES.filter((m) => OFFICIAL_ROUND[officialKey(m)] !== m.stage).map(
      (m) => `M${m.num}: ${m.stage} ≠ ${OFFICIAL_ROUND[officialKey(m)]}`,
    )
    expect(wrong).toEqual([])
  })

  it('files every group match under the officially published group', () => {
    const wrong = MATCHES.filter((m) => m.stage === 'Group')
      .filter((m) => OFFICIAL_MATCH_GROUP[officialKey(m)] !== m.group)
      .map((m) => `M${m.num}: ${m.group} ≠ ${OFFICIAL_MATCH_GROUP[officialKey(m)]}`)
    expect(wrong).toEqual([])
  })
})

// The tournament is finished, so these are facts, not projections. If a feed
// rewrites history, one of these fails.
describe('the recorded 2023 result', () => {
  const byNum = Object.fromEntries(MATCHES.map((m) => [m.num, m]))

  it('was won by Spain, 1–0 over England at Stadium Australia', () => {
    const final = byNum[64]
    expect([final.t1, final.t2]).toEqual(['Spain', 'England'])
    expect(final.score).toEqual([1, 0])
    // Won inside 90 minutes: no extra time, no shootout.
    expect(final.aet).toBeUndefined()
    expect(final.pens).toBeUndefined()
    expect(VENUES[final.venue].name).toBe('Stadium Australia')
  })

  it('has a final score for all 64 matches', () => {
    expect(MATCHES.every((m) => Array.isArray(m.score))).toBe(true)
  })

  it('records the three shootouts, and only those', () => {
    const pens = MATCHES.filter((m) => m.pens).map((m) => `${m.t1} ${m.pens.join('-')} ${m.t2}`)
    expect(pens.sort()).toEqual(
      [
        'Sweden 5-4 United States',
        'England 4-2 Nigeria',
        'Australia 7-6 France',
      ].sort(),
    )
  })

  it('plays extra time before EVERY shootout — the inverse of the Copa sibling', () => {
    // The FIFA rule, and the single most copy-paste-dangerous fact in this repo.
    // Every level knockout tie plays 30 minutes of extra time before penalties,
    // so `pens` ALWAYS implies `aet`. The sibling Copa América viewer is the
    // exact opposite — only its Final had extra time, and `pens` WITHOUT `aet`
    // is correct there. Do not copy this assertion, or the generator line that
    // produces it, between the two repos in either direction.
    const aet = MATCHES.filter((m) => m.aet).map((m) => m.num).sort((a, b) => a - b)
    expect(aet).toEqual([52, 54, 57, 59])
    // Every shootout also went to extra time first…
    expect(MATCHES.filter((m) => m.pens).every((m) => m.aet)).toBe(true)
    // …and match 57 is the case that keeps the implication one-way: extra time
    // settled it, so there is aet with no pens.
    expect(byNum[57].aet).toBe(true)
    expect(byNum[57].pens).toBeUndefined()
  })
})

describe('knockout slot labels', () => {
  it('keeps the drawn placeholder for every knockout match, alongside the real teams', () => {
    for (const m of MATCHES.filter((m) => m.stage !== 'Group')) {
      expect(m.label1, `M${m.num}`).toBeTruthy()
      expect(m.label2, `M${m.num}`).toBeTruthy()
      expect(slotLabels(m)).toEqual([m.label1, m.label2])
    }
  })

  it('leaves group matches without placeholders (both teams known at the draw)', () => {
    for (const m of MATCHES.filter((m) => m.stage === 'Group')) {
      expect(m.label1).toBeUndefined()
      expect(slotLabels(m)).toEqual([m.t1, m.t2])
    }
  })

  it('every "Winner Match N" reference points to an existing earlier match', () => {
    const nums = new Set(MATCHES.map((m) => m.num))
    const bad = []
    for (const m of MATCHES)
      for (const slot of slotLabels(m)) {
        const r = slot.match(/^(?:Winner|Loser) Match (\d+)$/)
        if (r) {
          const ref = Number(r[1])
          if (!nums.has(ref) || ref >= m.num) bad.push(`M${m.num} → "${slot}"`)
        }
      }
    expect(bad).toEqual([])
  })

  it('routes each group winner and runner-up into exactly one round-of-16 slot', () => {
    const seen = { winner: new Set(), runner: new Set() }
    for (const m of MATCHES.filter((m) => m.stage === 'R16'))
      for (const s of slotLabels(m)) {
        let hit = /^Winner Group ([A-H])$/.exec(s)
        if (hit) {
          expect(seen.winner.has(hit[1])).toBe(false)
          seen.winner.add(hit[1])
        }
        hit = /^Runner-up Group ([A-H])$/.exec(s)
        if (hit) {
          expect(seen.runner.has(hit[1])).toBe(false)
          seen.runner.add(hit[1])
        }
      }
    expect([...seen.winner].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    expect([...seen.runner].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
  })

  it('has no "3rd Group …" slots — third place is elimination, not a route through', () => {
    // The sibling Euro viewer asserts there are exactly four of these. The 2023
    // Women's World Cup has none: eight groups of four, top two of each and
    // nothing else advances, which is why this app carries no third-place
    // combination table at all.
    const thirds = MATCHES.flatMap(slotLabels).filter((s) => s.startsWith('3rd Group '))
    expect(thirds).toEqual([])
  })
})

describe('team home timezones', () => {
  it('maps every qualified team (and nothing else) to ≥1 home zone', () => {
    expect(Object.keys(TEAM_TIMEZONES).sort()).toEqual([...ALL_TEAMS].sort())
    expect(Object.values(TEAM_TIMEZONES).every((z) => z.length > 0)).toBe(true)
  })

  it('uses only valid IANA timezones', () => {
    const bad = []
    for (const [team, zones] of Object.entries(TEAM_TIMEZONES))
      for (const z of zones) {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: z })
        } catch {
          bad.push(`${team}: ${z}`)
        }
      }
    expect(bad).toEqual([])
  })
})

describe('schedule internal consistency', () => {
  const groupMatches = MATCHES.filter((m) => m.stage === 'Group')
  const ms = (iso) => new Date(iso).getTime()
  const teamSet = new Set(ALL_TEAMS)

  it('each group is a complete round-robin (6 games, every pair once, 3 per team)', () => {
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g)
      expect(gm, `group ${g} game count`).toHaveLength(6)
      const teams = TEAMS[g].map((t) => t.name).sort()
      const pairs = new Set(gm.map((m) => [m.t1, m.t2].sort().join(' v ')))
      const expected = []
      for (let i = 0; i < teams.length; i++)
        for (let j = i + 1; j < teams.length; j++)
          expected.push([teams[i], teams[j]].sort().join(' v '))
      expect([...pairs].sort(), `group ${g} pairings`).toEqual(expected.sort())
      const counts = {}
      for (const m of gm) for (const t of [m.t1, m.t2]) counts[t] = (counts[t] || 0) + 1
      expect(Object.values(counts), `group ${g} games per team`).toEqual([3, 3, 3, 3])
    }
  })

  it("each group's final two matches kick off simultaneously", () => {
    // Compare INSTANTS, not the stored strings. Every sibling viewer can get
    // away with `a.ko === b.ko` because its whole tournament shares one offset;
    // here the two halves of a matchday can be in different time zones and still
    // be simultaneous. Group D really does kick off at 19:00+08:00 in Perth and
    // 20:30+09:30 in Adelaide — the same moment, two different wall clocks — and
    // Group H the same at 18:00+08:00 and 20:00+10:00. A string comparison calls
    // those a failure and is simply the wrong test for this format.
    for (const g of Object.keys(TEAMS)) {
      const gm = groupMatches.filter((m) => m.group === g).sort((a, b) => ms(a.ko) - ms(b.ko))
      const [a, b] = gm.slice(-2)
      expect(ms(a.ko), `group ${g} matchday-3 simultaneity`).toBe(ms(b.ko))
    }
  })

  it('proves that simultaneity check is not trivially true: two zones, one instant', () => {
    // Guards the comment above. If the data were ever normalised to a single
    // offset the check would still pass but would have stopped testing anything
    // interesting — so assert that at least one group's final pair genuinely
    // spans two different stored offsets.
    const spans = Object.keys(TEAMS).filter((g) => {
      const gm = groupMatches.filter((m) => m.group === g).sort((a, b) => ms(a.ko) - ms(b.ko))
      const [a, b] = gm.slice(-2)
      return a.ko.slice(-6) !== b.ko.slice(-6)
    })
    expect(spans.sort()).toEqual(['D', 'H'])
  })

  it('no team plays two matches less than 48h apart', () => {
    const byTeam = {}
    for (const m of MATCHES)
      for (const t of [m.t1, m.t2])
        if (teamSet.has(t)) (byTeam[t] ||= []).push(m)
    const tooClose = []
    for (const [t, arr] of Object.entries(byTeam)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 48) tooClose.push(`${t}: M${arr[i - 1].num}→M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(tooClose).toEqual([])
  })

  it('no venue hosts two matches with overlapping (3h) windows', () => {
    const byVenue = {}
    for (const m of MATCHES) (byVenue[m.venue] ||= []).push(m)
    const clashes = []
    for (const [v, arr] of Object.entries(byVenue)) {
      arr.sort((a, b) => ms(a.ko) - ms(b.ko))
      for (let i = 1; i < arr.length; i++) {
        const gapH = (ms(arr[i].ko) - ms(arr[i - 1].ko)) / 3.6e6
        if (gapH < 3) clashes.push(`${v}: M${arr[i - 1].num}/M${arr[i].num} ${gapH.toFixed(1)}h`)
      }
    }
    expect(clashes).toEqual([])
  })
})
