import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseScoreboard, handler } from '../netlify/functions/calendar.js'
import { MATCHES } from '../src/data/matches.js'
import { VENUES } from '../src/data/venues.js'

// A committed snapshot of ESPN's real scoreboard response, so the parser is
// exercised against the actual feed rather than a hand-made imitation of it.
// Trimmed to the fields the function reads (the live response carries odds,
// broadcasts and headlines this feed has no use for). Refresh with:
//   curl -s 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc/scoreboard?dates=20230720-20230820&limit=100'
// then keep date / season.slug / competitions[0].{altGameNote,venue,status,competitors}.
//
// Unlike its Copa sibling this feed does NOT read openfootball: there is no
// women's edition in that organisation, so ESPN is the only source. See the
// header of netlify/functions/calendar.js.
const here = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = JSON.parse(readFileSync(resolve(here, 'fixtures/espn-scoreboard-snapshot.json'), 'utf8'))

const fetchSnapshot = () =>
  vi.fn(async () => ({ ok: true, json: async () => SNAPSHOT }))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseScoreboard — reading ESPN’s scoreboard', () => {
  const fixtures = parseScoreboard(SNAPSHOT)

  it('reads every match in the tournament from one range query', () => {
    // A date-range query returns the whole window, so all 64 arrive together.
    expect(fixtures).toHaveLength(64)
  })

  it('labels each match with the round it sits under, group letters included', () => {
    expect([...new Set(fixtures.map((f) => f.round))].sort()).toEqual([
      '3rd-Place', 'Final',
      'Group A', 'Group B', 'Group C', 'Group D',
      'Group E', 'Group F', 'Group G', 'Group H',
      'Quarterfinals', 'Round of 16', 'Semifinals',
    ])
    // season.slug flattens all 48 group games to "group-stage"; altGameNote is
    // what keeps the group letter, so a fallback to the slug would lose it.
    expect(fixtures.filter((f) => f.round === 'Group A')).toHaveLength(6)
    expect(fixtures.some((f) => /group-stage/.test(f.round))).toBe(false)
  })

  it('takes each kickoff instant from the feed, matching the committed schedule', () => {
    // The tournament spanned four host offsets (+08:00 Perth to +12:00 NZ), so
    // any assumed offset would put most matches at the wrong instant. Checked
    // against the app's own data, which is the fixture the UI renders.
    const byPair = new Map(
      MATCHES.map((m) => [[m.t1, m.t2].sort().join('|'), m]),
    )
    const mismatched = fixtures
      .map((f) => {
        const m = byPair.get([f.home, f.away].sort().join('|'))
        if (!m) return null
        return f.start.toISOString() === new Date(m.ko).toISOString()
          ? null
          : `${f.home} v ${f.away}: feed ${f.start.toISOString()} vs data ${new Date(m.ko).toISOString()}`
      })
      .filter(Boolean)
    // Group matches are a unique pair; knockout pairs can repeat across rounds,
    // so this checks the ones that join cleanly rather than claiming all 64.
    expect(mismatched).toEqual([])
  })

  it('states a plain result, a shootout and an extra-time win differently', () => {
    const find = (h, a) => fixtures.find((f) => f.home === h && f.away === a).result
    // ESPN keeps the level 120-minute score in `score` and the shootout tally in
    // `shootoutScore`, so a penalties tie must show both.
    expect(find('England', 'Colombia')).toBe(' (2–1)')
    expect(find('Sweden', 'United States')).toBe(' (0–0 p5–4)')
    expect(find('Spain', 'Netherlands')).toBe(' (2–1 AET)') // won in extra time, no shootout
  })

  it('names every venue the way the app does, not the way ESPN does', () => {
    // ESPN uses sponsor names; FIFA bans them at its tournaments and the app's
    // data follows FIFA. Nine of the ten venues therefore need translating, and
    // getting one wrong sends a subscriber to a differently-named stadium.
    const opener = fixtures.find((f) => f.home === 'New Zealand' && f.away === 'Norway')
    expect(opener.venue).toBe('Eden Park, Auckland') // the one venue both agree on

    const finalMatch = fixtures.find((f) => f.home === 'Spain' && f.away === 'England')
    expect(finalMatch.venue).toBe('Stadium Australia, Sydney') // ESPN calls it Accor Stadium

    // No feed spelling may survive into the calendar unless our data uses it too.
    const ours = new Set(Object.values(VENUES).map((v) => v.name))
    const foreign = [...new Set(fixtures.map((f) => f.venue.split(',')[0]))].filter((n) => !ours.has(n))
    expect(foreign, `venue names the app does not use: ${foreign.join(', ')}`).toEqual([])
  })

  it('covers all ten venues, so no sponsor name is left untranslated', () => {
    const seen = new Set(fixtures.map((f) => f.venue.split(',')[0]))
    expect(seen.size).toBe(Object.keys(VENUES).length)
  })

  it('passes through an unknown venue rather than blanking it', () => {
    // A venue ESPN renames later should still reach the calendar, just untranslated.
    const [m] = parseScoreboard({
      events: [{
        date: '2023-07-20T07:00Z',
        competitions: [{
          altGameNote: "FIFA Women's World Cup, Group A",
          venue: { fullName: 'Some New Arena', address: { city: 'Auckland' } },
          status: { type: { detail: 'FT' } },
          competitors: [
            { homeAway: 'home', score: '1', team: { displayName: 'New Zealand' } },
            { homeAway: 'away', score: '0', team: { displayName: 'Norway' } },
          ],
        }],
      }],
    })
    expect(m.venue).toBe('Some New Arena, Auckland')
  })

  it('skips an event with no competition, no teams or an unreadable date', () => {
    const broken = {
      events: [
        { date: '2023-07-20T07:00Z' }, // no competitions
        { date: '2023-07-20T07:00Z', competitions: [{ competitors: [] }] }, // no teams
        {
          date: 'not-a-date',
          competitions: [{
            competitors: [
              { homeAway: 'home', team: { displayName: 'Spain' } },
              { homeAway: 'away', team: { displayName: 'England' } },
            ],
          }],
        },
      ],
    }
    expect(parseScoreboard(broken)).toEqual([])
  })

  it('accepts the response as text as well as parsed JSON, and survives an empty one', () => {
    expect(parseScoreboard(JSON.stringify(SNAPSHOT))).toHaveLength(64)
    expect(parseScoreboard({})).toEqual([])
  })

  it('leaves the result blank for a match that has not been played', () => {
    const unplayed = {
      events: [{
        date: '2023-07-20T07:00Z',
        competitions: [{
          altGameNote: "FIFA Women's World Cup, Group A",
          status: { type: { detail: 'Scheduled' } },
          competitors: [
            { homeAway: 'home', score: null, team: { displayName: 'New Zealand' } },
            { homeAway: 'away', score: null, team: { displayName: 'Norway' } },
          ],
        }],
      }],
    }
    const [m] = parseScoreboard(unplayed)
    expect(m.result).toBe('')
    expect(m.venue).toBe('')
  })

  it('falls back to competitor order when ESPN omits the home/away flags', () => {
    const unflagged = {
      events: [{
        date: '2023-08-20T10:00Z',
        competitions: [{
          altGameNote: "FIFA Women's World Cup, Final",
          status: { type: { detail: 'FT' } },
          competitors: [
            { score: '1', team: { displayName: 'Spain' } },
            { score: '0', team: { displayName: 'England' } },
          ],
        }],
      }],
    }
    const [m] = parseScoreboard(unflagged)
    expect([m.home, m.away]).toEqual(['Spain', 'England'])
    expect(m.result).toBe(' (1–0)')
  })

  it('falls back to a plain round label when altGameNote is missing or unsplit', () => {
    const rounds = parseScoreboard({
      events: [
        {
          date: '2023-07-20T07:00Z',
          competitions: [{
            competitors: [
              { homeAway: 'home', team: { displayName: 'Spain' } },
              { homeAway: 'away', team: { displayName: 'England' } },
            ],
          }],
        },
        {
          date: '2023-07-20T07:00Z',
          competitions: [{
            altGameNote: 'Final',
            competitors: [
              { homeAway: 'home', team: { displayName: 'Spain' } },
              { homeAway: 'away', team: { displayName: 'England' } },
            ],
          }],
        },
      ],
    }).map((m) => m.round)
    expect(rounds).toEqual(['Group stage', 'Final'])
  })
})

describe('handler — the .ics the feed serves', () => {
  it('emits a VCALENDAR with one event per match', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/)
    expect(res.body).toContain("PRODID:-//Women's World Cup 2023 Viewer//EN")
    expect(res.body).toContain("X-WR-CALNAME:Women's World Cup 2023")
    expect((res.body.match(/BEGIN:VEVENT/g) || [])).toHaveLength(64)
    expect(res.body).toContain("SUMMARY:Women's World Cup 2023: Spain vs England (1–0)")
  })

  it('places each event at the instant and stadium the app’s own schedule has', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: null })
    const events = res.body.split('BEGIN:VEVENT').slice(1)
    const eventFor = (home, away) =>
      events.find((e) => e.includes(`SUMMARY:Women's World Cup 2023: ${home} vs ${away}`))
    const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

    // The Final and the opener — opposite ends of the tournament and of the host
    // offsets (+10:00 Sydney and +12:00 Auckland).
    for (const [home, away, num] of [['Spain', 'England', 64], ['New Zealand', 'Norway', 1]]) {
      const ev = eventFor(home, away)
      const match = MATCHES.find((m) => m.num === num)
      expect(ev, `${home} v ${away}`).toBeTruthy()
      expect(ev).toContain(`DTSTART:${icsStamp(match.ko)}`)
      expect(ev).toContain(VENUES[match.venue].name)
    }
  })

  it('describes each event with its round', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: null })
    expect(res.body).toContain('DESCRIPTION:Round of 16')
    expect(res.body).toContain('DESCRIPTION:Group H')
  })

  it('filters to the requested teams', async () => {
    vi.stubGlobal('fetch', fetchSnapshot())
    const res = await handler({ queryStringParameters: { teams: 'vietnam' } })
    expect(res.body).toContain("X-WR-CALNAME:Women's World Cup 2023 — My Teams")
    // Vietnam played their three group games and nothing else.
    expect((res.body.match(/BEGIN:VEVENT/g) || [])).toHaveLength(3)
    expect(res.body).not.toContain('Spain vs England')
  })

  it('reports an upstream failure rather than serving an empty calendar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })))
    expect(await handler({ queryStringParameters: null })).toMatchObject({ statusCode: 502 })
  })

  it('reports a thrown fetch as a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const res = await handler({ queryStringParameters: null })
    expect(res.statusCode).toBe(500)
    expect(res.body).toMatch(/offline/)
  })
})
