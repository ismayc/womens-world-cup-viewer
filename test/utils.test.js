import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'
import { weekStartOf, addDays } from '../src/utils/week.js'
import {
  dayKey,
  formatTime,
  matchStatus,
  liveState,
  teamLocalKickoffs,
  teamKickoffTooltip,
} from '../src/utils/time.js'
import { TEAM_TIMEZONES } from '../src/data/teamTimezones.js'
import { ALL_TEAMS } from '../src/data/teams.js'
import { buildICS, webcalUrl, googleCalendarUrl } from '../src/utils/ics.js'
import { computeGroup } from '../src/utils/standings.js'

describe('week utils', () => {
  it('weekStartOf returns the preceding Sunday', () => {
    expect(weekStartOf('2024-06-20')).toBe('2024-06-16') // Thu -> Sun
    expect(weekStartOf('2024-06-16')).toBe('2024-06-16') // Sun -> itself
  })

  it('addDays does calendar math across month boundaries', () => {
    expect(addDays('2024-06-28', 6)).toBe('2024-07-04')
  })

  it('every match falls inside exactly one listed week', () => {
    const tz = 'America/New_York'
    const weeks = [...new Set(MATCHES.map((m) => weekStartOf(dayKey(m.ko, tz))))]
    for (const m of MATCHES) {
      const k = dayKey(m.ko, tz)
      const hits = weeks.filter((w) =>
        Array.from({ length: 7 }, (_, i) => addDays(w, i)).includes(k),
      )
      expect(hits).toHaveLength(1)
    }
  })
})

describe('time utils', () => {
  it('converts the opening match (7pm in Auckland) to other zones', () => {
    const open = MATCHES.find((m) => m.num === 1).ko
    // 19:00 +12:00 = 07:00Z, which lands in the small hours across the Americas —
    // the opposite of the Copa sibling, whose evening kickoffs stayed same-day.
    expect(formatTime(open, 'America/New_York')).toBe('3:00 AM')
    expect(formatTime(open, 'America/Los_Angeles')).toBe('12:00 AM')
    // In Europe the same instant is a MORNING kickoff. (Asserting the clock
    // rather than the abbreviation: Node renders BST as GMT+1 on some ICU builds.)
    expect(formatTime(open, 'Europe/London')).toBe('8:00 AM')
  })

  it('classifies match status by time', () => {
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-20T00:00:00Z'))).toBe('upcoming')
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-21T00:30:00Z'))).toBe('live')
    expect(matchStatus('2024-06-21T00:00:00Z', Date.parse('2024-06-21T03:00:00Z'))).toBe('finished')
  })

  it('liveState prefers feed data over the clock', () => {
    const ko = '2024-06-21T00:00:00Z'
    const duringWindow = Date.parse('2024-06-21T00:30:00Z') // time-based "live"
    // A finished match (has a score) reads finished even inside the live window.
    expect(liveState({ ko, score: [2, 0] }, duringWindow)).toBe('finished')
    // ESPN's live flag wins regardless of clock.
    expect(liveState({ ko, score: [1, 0], live: { clock: "HT" } }, duringWindow)).toBe('live')
    // No feed data yet -> fall back to the time-based guess.
    expect(liveState({ ko }, duringWindow)).toBe('live')
    expect(liveState({ ko }, Date.parse('2024-06-20T00:00:00Z'))).toBe('upcoming')
  })
})

describe('team local kickoff tooltip', () => {
  const open = MATCHES.find((m) => m.num === 1).ko // opener, 7pm in Auckland

  it('gives a single home-time line for a single-zone country', () => {
    // Abbrev rendering of a European zone varies by ICU build (CEST vs GMT+2),
    // so assert the wall-clock and that exactly one line comes back.
    const lines = teamLocalKickoffs(open, 'Norway')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^Jul 20, 9:00 AM /)
  })

  it('lists one line per distinct wall-clock for a multi-zone country', () => {
    // The USA spans Hawaii→Eastern; the opener reads differently in each, and
    // crosses the CALENDAR DAY partway down the list — Hawaii and Alaska are
    // still on 19 July while the mainland has ticked over to the 20th. US
    // abbreviations are stable across ICU builds, so assert them.
    const lines = teamLocalKickoffs(open, 'United States')
    expect(lines).toEqual([
      'Jul 19, 9:00 PM HST',
      'Jul 19, 11:00 PM AKDT',
      'Jul 20, 12:00 AM PDT',
      'Jul 20, 1:00 AM MDT',
      'Jul 20, 2:00 AM CDT',
      'Jul 20, 3:00 AM EDT',
    ])
  })

  it('collapses zones that read the same clock at the instant', () => {
    // Australia lists 5 zones, but neither Darwin/Adelaide (+09:30) nor
    // Brisbane/Sydney (+10) can be told apart in July — no state observes DST
    // then — so five zones collapse to three distinct clocks.
    expect(TEAM_TIMEZONES.Australia).toHaveLength(5)
    expect(teamLocalKickoffs(open, 'Australia')).toHaveLength(3)
  })

  it('returns empty for unknown teams (e.g. knockout placeholders)', () => {
    expect(teamLocalKickoffs(open, 'Winner Group A')).toEqual([])
    expect(teamKickoffTooltip(open, 'Winner Group A')).toBe('')
  })

  it('builds a labelled multi-line tooltip', () => {
    expect(teamKickoffTooltip(open, 'Norway')).toMatch(/^Kickoff in Norway:\nJul 20, 9:00 AM /)
    expect(teamKickoffTooltip(open, 'United States')).toMatch(
      /^Kickoff in United States \(local times\):\n/,
    )
  })

  it('has a timezone entry for every qualified team', () => {
    for (const name of ALL_TEAMS) {
      expect(TEAM_TIMEZONES[name], `${name} missing a home timezone`).toBeTruthy()
      expect(TEAM_TIMEZONES[name].length).toBeGreaterThan(0)
    }
  })
})

describe('ICS export', () => {
  it('emits a valid VEVENT with correct UTC start/end', () => {
    const final = MATCHES.find((m) => m.stage === 'Final')
    const ics = buildICS(final)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('DTSTART:20230820T100000Z') // 8pm Sydney -> 10:00 UTC same day
    expect(ics).toContain('DTEND:20230820T121500Z') // +2h15m
    expect(ics).toContain('LOCATION:Stadium Australia')
    expect(ics).toContain('END:VCALENDAR')
  })
})

describe('calendar subscription links', () => {
  const FEED = 'https://womens-world-cup-viewer.netlify.app/calendar.ics'

  it('webcalUrl swaps the scheme to webcal', () => {
    expect(webcalUrl(FEED)).toBe('webcal://womens-world-cup-viewer.netlify.app/calendar.ics')
    expect(webcalUrl('http://x/y.ics')).toBe('webcal://x/y.ics')
  })

  it('googleCalendarUrl uses a raw webcal:// cid (not https, not percent-encoded)', () => {
    const link = googleCalendarUrl(FEED)
    expect(link).toBe(
      'https://www.google.com/calendar/render?cid=webcal://womens-world-cup-viewer.netlify.app/calendar.ics',
    )
    // The old bug: an https/encoded cid that Google rejects with "check the URL".
    expect(link).not.toContain('cid=https')
    expect(link).not.toContain('%3A')
  })

  it('preserves the ?teams= query string for the my-teams feed', () => {
    const myFeed = `${FEED}?teams=Spain,England`
    const link = googleCalendarUrl(myFeed)
    expect(link).toContain('cid=webcal://womens-world-cup-viewer.netlify.app/calendar.ics?teams=Spain,England')
    expect(link).not.toContain('%3F') // the "?" stays raw so Google keeps the query
  })
})

describe('standings', () => {
  it('tallies points, GD and ordering from scored matches', () => {
    const scored = MATCHES.map((m) =>
      m.num === 1 ? { ...m, score: [2, 1] } : m, // New Zealand 2-1 Norway
    )
    const table = computeGroup('A', scored)
    const arg = table.find((r) => r.name === 'New Zealand')
    const can = table.find((r) => r.name === 'Norway')
    expect(arg.Pts).toBe(3)
    expect(arg.GD).toBe(1)
    expect(can.Pts).toBe(0)
    expect(can.GD).toBe(-1)
    expect(table[0].name).toBe('New Zealand') // sorted to top
  })
})

describe('venue timezones', () => {
  it('every venue has a valid IANA timezone', () => {
    for (const v of Object.values(VENUES)) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: v.tz })).not.toThrow()
    }
  })
})
