// Auto-updating iCalendar feed for calendar subscriptions (webcal://).
// Fetches ESPN's scoreboard on each request and emits an .ics, so a subscribed
// calendar shows resolved knockout teams and final scores. Optional
// ?teams=Spain,England filters to specific teams (case-insensitive).
//
// This is an ES MODULE on purpose. The package sets "type": "module", so a
// CommonJS function (`exports.handler`) is rejected by Netlify's runtime with
// "module is not defined in ES module scope" whenever the site is built from Git
// rather than deployed through netlify-cli, which bundles it away. The sibling
// world-cup-viewer still carries the CommonJS form and only gets away with it
// because it deploys via the CLI.
//
// The source is ESPN, NOT OpenFootball. Every sibling viewer parses a
// competition's plain-text fixture file from openfootball, but there is no
// women's edition in that organisation at all — worldcup, euro and copa-america
// are all men's-only — so there is nothing to parse. ESPN is this app's single
// runtime source everywhere else too (see services/espn.js), which makes it the
// consistent choice rather than merely the available one. A Netlify function
// can't import from the Vite app's source tree, so the small amount of shape
// knowledge below is a deliberate restatement of services/espn.js.

const FEED =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc/scoreboard' +
  '?dates=20230720-20230820&limit=100'
const MATCH_MS = 135 * 60 * 1000

// One range query returns the whole tournament — all 64 matches, earliest
// included — so there is no per-date paging to do. See the family note on
// ESPN scoreboard range look-ahead.

// ESPN names stadiums COMMERCIALLY; FIFA bans sponsor names at its tournaments
// and the app's committed data (data/venues.js, built from FIFA) uses the clean
// name. Nine of the ten venues differ — only Eden Park, which has no sponsor
// name, agrees — so without this table a subscriber's calendar names a different
// stadium from the app for 58 of the 64 matches.
//
// This is the `sponsorName` -> `name` half of VENUE_META in
// scripts/fetch-tournament.mjs, restated because a Netlify function can't import
// from the repo. That table is the one to edit first; keep this in step with it.
// test/calendar-feed.test.js asserts every venue the feed emits is a name the
// app's own data uses, so a drift between the two is a red test.
const VENUE_ALIASES = {
  'AAMI Park': 'Melbourne Rectangular Stadium',
  'Accor Stadium': 'Stadium Australia',
  'Allianz Stadium': 'Sydney Football Stadium',
  'Coopers Stadium': 'Hindmarsh Stadium',
  'FMG Stadium Waikato': 'Waikato Stadium',
  'Forsyth Barr Stadium': 'Dunedin Stadium',
  'HBF Park': 'Perth Rectangular Stadium',
  'Sky Stadium': 'Wellington Regional Stadium',
  'Suncorp Stadium': 'Brisbane Stadium',
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function toICSDate(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'
  )
}

function esc(t) {
  return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// ESPN labels the round in `altGameNote` as "FIFA Women's World Cup, Group A" /
// ", Round of 16" / ", Final". The competition prefix is the same on all 64, so
// only the tail is interesting. `season.slug` also carries the round but flattens
// all 48 group games to "group-stage", losing the group letter.
function roundOf(comp) {
  const note = String(comp.altGameNote || '')
  const tail = note.includes(',') ? note.slice(note.indexOf(',') + 1).trim() : note.trim()
  return tail || 'Group stage'
}

// The decisive score and how it was reached. ESPN puts the manner in
// `status.type.detail`: "FT", "AET", or "FT-Pens" — and for a shootout the
// competitor's `score` is still the level 120-minute score, with the shootout
// tally in `shootoutScore`.
function resultText(status, a, b) {
  if (a.score == null || b.score == null) return ''
  if (/pens/i.test(status)) return ` (${a.score}–${b.score} p${a.pens}–${b.pens})`
  if (/aet/i.test(status)) return ` (${a.score}–${b.score} AET)`
  return ` (${a.score}–${b.score})`
}

function sideOf(competitor) {
  return {
    name: (competitor.team?.displayName || '').trim(),
    score: competitor.score == null || competitor.score === '' ? null : Number(competitor.score),
    pens: competitor.shootoutScore == null ? null : Number(competitor.shootoutScore),
  }
}

export function parseScoreboard(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json
  const out = []
  for (const event of data?.events || []) {
    const comp = event.competitions?.[0]
    if (!comp) continue
    const competitors = comp.competitors || []
    // ESPN flags home/away explicitly; the event `name` is "Away at Home", so
    // reading the pair off the flags rather than the string keeps the ICS
    // summary in the home-first order the app itself uses.
    const home = competitors.find((c) => c.homeAway === 'home') || competitors[0]
    const away = competitors.find((c) => c.homeAway === 'away') || competitors[1]
    if (!home || !away) continue

    const start = new Date(event.date)
    if (Number.isNaN(start.getTime())) continue

    const h = sideOf(home)
    const a = sideOf(away)
    const venue = comp.venue || {}
    const city = venue.address?.city
    const venueName = VENUE_ALIASES[venue.fullName] || venue.fullName

    out.push({
      start,
      home: h.name,
      away: a.name,
      result: resultText(comp.status?.type?.detail || '', h, a),
      venue: [venueName, city].filter(Boolean).join(', '),
      round: roundOf(comp),
      date: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}`,
    })
  }
  return out
}

function vevent(m) {
  const end = new Date(m.start.getTime() + MATCH_MS)
  const uid = `wwc2023-${m.date}-${m.home}-${m.away}@womensworldcupviewer`.replace(/\s+/g, '_')
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(m.start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${esc(`Women's World Cup 2023: ${m.home} vs ${m.away}${m.result}`)}`,
    `LOCATION:${esc(m.venue)}`,
    `DESCRIPTION:${esc(m.round)}`,
    'END:VEVENT',
  ].join('\r\n')
}

export const handler = async (event) => {
  try {
    const res = await fetch(FEED)
    if (!res.ok) return { statusCode: 502, body: `Upstream ${res.status}` }
    let matches = parseScoreboard(await res.json())

    const teamsParam = (event.queryStringParameters && event.queryStringParameters.teams) || ''
    let calName = "Women's World Cup 2023"
    if (teamsParam) {
      const want = new Set(teamsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
      matches = matches.filter((m) => want.has(m.home.toLowerCase()) || want.has(m.away.toLowerCase()))
      calName = "Women's World Cup 2023 — My Teams"
    }

    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      "PRODID:-//Women's World Cup 2023 Viewer//EN",
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(calName)}`,
      'X-PUBLISHED-TTL:PT2H',
      'REFRESH-INTERVAL;VALUE=DURATION:PT2H',
      ...matches.map(vevent),
      'END:VCALENDAR',
    ].join('\r\n')

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="womens-world-cup-2023.ics"',
        'Cache-Control': 'public, max-age=900',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    }
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` }
  }
}
