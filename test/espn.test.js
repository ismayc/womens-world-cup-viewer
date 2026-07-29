import { describe, it, expect, vi } from 'vitest'
import { fetchLive, applyLive, scoreboardDates, historyDates } from '../src/services/espn.js'
import { pairKey } from '../src/services/teamNames.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

describe('scoreboardDates', () => {
  it('returns the UTC day before/of/after a base instant', () => {
    expect(scoreboardDates(new Date('2023-07-24T12:00:00Z'))).toEqual(['20230723', '20230724', '20230725'])
  })

  it('covers an early-UTC kickoff under the right date (the slate-lag bug)', () => {
    // Every kickoff in this edition lands in the MORNING UTC (a 19:00 New Zealand
    // start is 07:00Z the same day), so unlike the Copa sibling's US evening
    // games nothing rolls past midnight UTC. The ±1 day window still matters:
    // it covers ESPN's slate lagging a day behind.
    expect(scoreboardDates(new Date('2023-07-20T07:00:00Z'))).toContain('20230720')
  })
})

describe('historyDates', () => {
  it('lists distinct UTC dates of already-finished matches, excluding the live window', () => {
    // Base: 25 July noon UTC. Live window (scoreboardDates) = Jul 24/25/26, so
    // those are excluded; earlier match days (Jul 20–23) are the backfill set.
    const dates = historyDates(MATCHES, new Date('2023-07-25T12:00:00Z'))
    expect(dates).toEqual(['20230720', '20230721', '20230722', '20230723'])
  })

  it('is empty before the tournament starts (nothing has kicked off)', () => {
    expect(historyDates(MATCHES, new Date('2023-07-01T00:00:00Z'))).toEqual([])
  })

  it('excludes matches that have not kicked off yet', () => {
    const dates = historyDates(MATCHES, new Date('2023-07-22T12:00:00Z'))
    // Jul 21/22/23 are in the live window; only Jul 20 is older + finished.
    expect(dates).toEqual(['20230720'])
  })
})

const match1 = MATCHES.find((m) => m.num === 1) // New Zealand v Norway, 20 July (07:00Z)
const instOf = (m) => 'inst:' + new Date(m.ko).getTime()

// Minimal ESPN scoreboard shape (one competition per event).
const event = ({ date, state, clock, home, hs, away, as, details }) => ({
  date,
  status: { displayClock: clock, type: { state, shortDetail: clock, description: state } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { id: 'H', displayName: home }, score: hs },
        { homeAway: 'away', team: { id: 'A', displayName: away }, score: as },
      ],
      details: details || [],
    },
  ],
})

// One ESPN scoring-play detail (team is 'H' or 'A').
const goal = ({ team, min, name, pen = false, og = false }) => ({
  type: { id: '70', text: 'Goal' },
  clock: { displayValue: `${min}'` },
  team: { id: team },
  scoringPlay: true,
  penaltyKick: pen,
  ownGoal: og,
  shootout: false,
  athletesInvolved: [{ shortName: name, displayName: name }],
})

describe('fetchLive (parsing ESPN shape)', () => {
  it('prefers the FULL athlete name and keeps in-match penalty goals (Oyarzabal bug)', async () => {
    // Real ESPN shape for an in-match penalty: type "Penalty - Scored",
    // penaltyKick true, shootout false, short + full names both present.
    const feed = {
      events: [
        event({
          date: '2023-08-15T08:00Z',
          state: 'in',
          clock: "82'",
          home: 'Spain',
          hs: '0',
          away: 'Sweden',
          as: '2',
          details: [
            {
              type: { id: '98', text: 'Penalty - Scored' },
              clock: { displayValue: "22'" },
              team: { id: 'A' },
              scoringPlay: true,
              penaltyKick: true,
              shootout: false,
              athletesInvolved: [{ shortName: 'F. Angeldal', displayName: 'Filippa Angeldal' }],
            },
            // A shootout kick must STILL be excluded from the goal list.
            {
              type: { id: '98', text: 'Penalty - Scored' },
              clock: { displayValue: "120'" },
              team: { id: 'A' },
              scoringPlay: true,
              penaltyKick: true,
              shootout: true,
              athletesInvolved: [{ shortName: 'P. Kicker', displayName: 'Pen Kicker' }],
            },
          ],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()
    const rec = map.get(pairKey('Spain', 'Sweden'))
    expect(rec.goals.away).toEqual([
      { name: 'Filippa Angeldal', minute: 22, extra: undefined, penalty: true, og: false },
    ])
  })

  it('parses live score, clock, and keys by pair + instant; maps ESPN aliases', async () => {
    const feed = {
      events: [
        event({ date: '2023-07-20T07:00Z', state: 'in', clock: "67'", home: 'New Zealand', hs: '2', away: 'Norway', as: '1' }),
        // "United States" is our canonical name and must survive untouched — the
        // inherited alias table rewrote it to "USA" and dropped every USA match.
        event({ date: '2023-07-22T01:00Z', state: 'pre', clock: '0\'', home: 'United States', hs: '0', away: 'Vietnam', as: '0' }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))

    const map = await fetchLive()

    const rec = map.get(pairKey('New Zealand', 'Norway'))
    expect(rec.score).toEqual([2, 1])
    expect(rec.state).toBe('in')
    expect(rec.clock).toBe("67'")
    // Also addressable by kickoff instant.
    expect(map.get('inst:' + new Date('2023-07-20T07:00Z').getTime())).toBe(rec)

    // Name preserved, and a pre-match carries a null score.
    const usa = map.get(pairKey('United States', 'Vietnam'))
    expect(usa.score).toBeNull()
    expect(usa.state).toBe('pre')
  })

  it('throws only when every scoreboard date request fails', async () => {
    // fetchLive now queries a few dates around now (yesterday/today/tomorrow) and
    // merges, so it's best-effort: it rejects only if none of them are reachable.
    global.fetch = vi.fn(async () => ({ ok: false, status: 502 }))
    await expect(fetchLive()).rejects.toThrow(/scoreboard|unreachable/i)
  })

  it('still returns a map when only one date slate responds', async () => {
    const feed = {
      events: [
        event({ date: '2026-06-14T04:00Z', state: 'in', clock: "43'", home: 'Netherlands', hs: '1', away: 'Poland', as: '0' }),
      ],
    }
    let n = 0
    global.fetch = vi.fn(async () => (n++ === 0 ? { ok: true, json: async () => feed } : { ok: false, status: 500 }))
    const map = await fetchLive()
    expect(map.get(pairKey('Netherlands', 'Poland')).score).toEqual([1, 0])
  })
})

describe('applyLive (overlay onto the merged schedule)', () => {
  it('overlays a live score oriented to our team order and sets match.live', () => {
    // ESPN reports Norway as home — our order is (New Zealand, Norway).
    const map = new Map([
      [pairKey('New Zealand', 'Norway'), { home: 'Norway', away: 'New Zealand', score: [1, 2], state: 'in', clock: "67'", detail: '2nd Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 1)
    expect(m.score).toEqual([2, 1]) // flipped to (New Zealand, Norway)
    expect(m.live).toEqual({ clock: "67'", detail: '2nd Half' })
    expect(m.liveSource).toBe(true)
  })

  it('defers to the committed score, but still overlays ESPN cards/subs (the missing-cards bug)', () => {
    // A match that already HOLDS a score keeps it — the committed schedule is the
    // record for this finished edition — yet must still gain ESPN's card and sub
    // timeline, which the committed data does not carry. (The sibling viewers
    // phrase this as "OpenFootball wins the score"; there is no such feed here.)
    const withScore = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [0, 0] } : m))
    const map = new Map([
      [
        pairKey('New Zealand', 'Norway'),
        {
          home: 'New Zealand',
          away: 'Norway',
          score: [2, 1],
          state: 'post',
          clock: 'FT',
          cards: { home: [{ name: 'A. Riley', minute: 40, color: 'yellow' }], away: [] },
          subs: { home: [], away: [{ minute: 75, names: ['Player'] }] },
        },
      ],
    ])
    const m = applyLive(withScore, map).find((x) => x.num === 1)
    expect(m.score).toEqual([0, 0]) // the committed score wins
    expect(m.live).toBeUndefined() // not flagged live
    // ESPN home = New Zealand = our t1, so cards/subs map straight through.
    expect(m.cards.t1).toEqual([{ name: 'A. Riley', minute: 40, color: 'yellow' }])
    expect(m.subs.t2).toEqual([{ minute: 75, names: ['Player'] }])
  })

  it('orients overlaid cards when ESPN home/away is the reverse of our order', () => {
    const withScore = MATCHES.map((m) => (m.num === 1 ? { ...m, score: [2, 1] } : m))
    // ESPN home = Norway (our t2): the away card belongs to New Zealand (our t1).
    const map = new Map([
      [
        pairKey('New Zealand', 'Norway'),
        {
          home: 'Norway',
          away: 'New Zealand',
          score: [1, 2],
          state: 'post',
          cards: { home: [{ name: 'NOR Player', minute: 20, color: 'yellow' }], away: [{ name: 'NZL Player', minute: 30, color: 'red' }] },
          subs: { home: [], away: [] },
        },
      ],
    ])
    const m = applyLive(withScore, map).find((x) => x.num === 1)
    expect(m.cards.t1).toEqual([{ name: 'NZL Player', minute: 30, color: 'red' }])
    expect(m.cards.t2).toEqual([{ name: 'NOR Player', minute: 20, color: 'yellow' }])
  })

  it('resolves a knockout placeholder by kickoff instant and overlays its score', () => {
    const ko = MATCHES.find((m) => m.num === 49) // round of 16, placeholder teams
    const map = new Map([
      [instOf(ko), { home: 'Switzerland', away: 'Spain', score: [1, 0], state: 'in', clock: "30'", detail: '1st Half' }],
    ])
    const merged = applyLive(MATCHES, map)
    const m = merged.find((x) => x.num === 49)
    expect(m.t1).toBe('Switzerland')
    expect(m.t2).toBe('Spain')
    expect(m.score).toEqual([1, 0])
    expect(m.live.clock).toBe("30'")
  })

  it('returns the input unchanged when there is no live data', () => {
    expect(applyLive(MATCHES, null)).toBe(MATCHES)
    expect(applyLive(MATCHES, new Map())).toBe(MATCHES)
  })

  it('parses cards and preserves stoppage-time minutes, oriented to our order', async () => {
    // ESPN home = Norway (our t2), so events on team 'A' are New Zealand's (t1).
    const feed = {
      events: [
        event({
          date: '2023-07-20T07:00Z', state: 'in', clock: "45'+2'",
          home: 'Norway', hs: '0', away: 'New Zealand', as: '1',
          details: [
            { type: { text: 'Goal' }, clock: { displayValue: "45'+2'" }, team: { id: 'A' }, scoringPlay: true, athletesInvolved: [{ shortName: 'H. Wilkinson' }] },
            { type: { text: 'Yellow Card' }, clock: { displayValue: "40'" }, team: { id: 'A' }, yellowCard: true, athletesInvolved: [{ shortName: 'A. Riley' }] },
          ],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const m = applyLive(MATCHES, await fetchLive()).find((x) => x.num === 1)

    expect(m.goals.t1).toEqual([{ name: 'H. Wilkinson', minute: 45, extra: 2, penalty: false, og: false }])
    expect(m.cards.t1).toEqual([{ name: 'A. Riley', minute: 40, extra: undefined, color: 'yellow' }])
    // ...and the live label uses ESPN's shortDetail (so "HT"/"FT" show, not the clock).
    expect(m.live.clock).toBe("45'+2'")
  })

  it('parses goal events and orients the scorer timeline to our team order', async () => {
    // ESPN home = Norway (away in our order), so goals must be flipped.
    const feed = {
      events: [
        event({
          date: '2023-07-20T07:00Z', state: 'in', clock: "31'",
          home: 'Norway', hs: '0', away: 'New Zealand', as: '1',
          details: [goal({ team: 'A', min: 9, name: 'H. Wilkinson' })],
        }),
      ],
    }
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => feed }))
    const map = await fetchLive()

    const m = applyLive(MATCHES, map).find((x) => x.num === 1) // our order: New Zealand v Norway
    expect(m.score).toEqual([1, 0])
    expect(m.goals.t1).toEqual([{ name: 'H. Wilkinson', minute: 9, penalty: false, og: false }])
    expect(m.goals.t2).toEqual([])
  })
})
