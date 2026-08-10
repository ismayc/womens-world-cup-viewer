// Builds the committed tournament snapshot in src/data/ for the FIFA Women's
// World Cup 2023 (co-hosted by Australia and New Zealand).
//
// Two independent public sources, both keyless and free:
//
//   • ESPN (site API, soccer/fifa.wwc) — STRUCTURE. Per-match event ids (which
//     is what lets the match detail modal pull a three-year-old box score at
//     runtime), venues, group labels, scores, shootout scores, the AET / FT-Pens
//     status detail, and goal scorers with minutes.
//   • FIFA (api.fifa.com, idCompetition=103 idSeason=285026) — the AUTHORITY.
//     Official match NUMBERS (1-64), kickoff instants, venues and scores. The
//     sibling world-cup-viewer already treats this API as the authority for
//     schedule validation; here it is also the cross-check that makes the build
//     fail rather than ship a silent drift.
//
// This edition has no OpenFootball source at all. OpenFootball publishes men's
// World Cups only — there is no women's repo, in any format — so the "source of
// record" role the sibling viewers give it is taken by FIFA's own API instead.
// That is a straight upgrade: FIFA is the authority the men's viewer validates
// AGAINST, and it carries the official match numbering the fixture list is
// stated in.
//
// The build fails unless, for every one of the 64 matches, the two sources agree
// on the kickoff instant, the venue and the final score.
//
// TWO THINGS THIS EDITION DOES DIFFERENTLY FROM EVERY SIBLING:
//
//   1. There is no single tournament timezone. The ten venues span four offsets
//      in the southern winter — NZST (+12), AEST (+10), ACST (+09:30) and AWST
//      (+08) — so each match stores its OWN venue's offset rather than one
//      edition-wide one. `new Date(ko)` is an absolute instant either way; this
//      just means the committed string reads as the local kickoff a spectator at
//      the ground would have seen.
//   2. Every knockout tie plays extra time before penalties, so a shootout here
//      always implies `aet`. That is the exact opposite of Copa América 2024,
//      where only the Final went to extra time and `pens` without `aet` was
//      correct. The two must not be copied between repos.
//
// VENUE NAMING: FIFA bans sponsor names at its tournaments, so the matches were
// played and broadcast under official names (Stadium Australia, Sky Stadium's
// "Wellington Regional Stadium", …) while ESPN files them under their commercial
// ones (Accor Stadium, Sky Stadium, …). The official names are what the app
// shows; the ESPN name is only a join key. FIFA also published every host city
// under its English AND Indigenous name, which the venue table preserves.
//
// Node built-ins only (no imports at all) so the data workflow runs on a bare
// checkout — enforced by test/scripts-runtime.test.js.
//
//   node scripts/fetch-tournament.mjs        # rewrite src/data/*.js
//   node scripts/fetch-tournament.mjs --dry  # report only, write nothing

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getJson } from './lib/fetch.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc'
const FIFA =
  'https://api.fifa.com/api/v3/calendar/matches?idCompetition=103&idSeason=285026&count=200&language=en'

// ---------------------------------------------------------------------------
// The edition. Everything below this line is WWC-2023-specific and is what a
// future edition rewrites; the machinery underneath it is format-general.
// ---------------------------------------------------------------------------

const EDITION = {
  year: 2023,
  host: 'Australia & New Zealand',
  hostFlag: '🇦🇺🇳🇿',
  window: '20230720-20230821',
  matches: 64,
  teams: 32,
  groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  venues: 10,
  // Deliberately NO tzOffset. Two host countries and four southern-winter
  // offsets (+12 / +10 / +09:30 / +08) mean a single tournament clock does not
  // exist, so each match carries its venue's own offset — see venueOffset().
}

// The knockout fixture list, with FIFA's official match numbers (49-64).
//
// Slot labels are not guessed: they are derived from the real group tables and
// verified against the played fixtures (Match 49 is Winner A v Runner-up C, and
// it was Switzerland v Spain, who did finish 1st in A and 2nd in C). All sixteen
// are re-checked against FIFA by scripts/check-bracket-consistency.mjs.
//
// The pattern is 1A-2C, 1C-2A, 1E-2G, 1G-2E, 1B-2D, 1D-2B, 1F-2H, 1H-2F, with the
// two halves meeting only in the Final. This is NOT the men's 32-team bracket,
// which pairs adjacent groups (1A-2B, 1C-2D, …) and splits its halves A-D / E-H.
// Here each group is drawn against the group TWO letters along, and the halves
// are the ODD letters (A, C, E, G) against the EVEN ones (B, D, F, H).
//
// That difference has a visible consequence: the two host nations — New Zealand
// in Group A and Australia in Group B — land in opposite halves and could only
// ever have met in the Final. Do not "correct" this toward the men's pattern.
//
// Like Copa América and unlike the Euro, the third-place play-off still exists
// (match 63), and it is the only place the "Loser Match N" feed form appears.
// Unlike Copa América, only the top TWO of each of the EIGHT groups advance,
// which is 16 teams — so the groups feed a ROUND OF 16, not the quarter-finals.
// There is no best-third qualification; a group's 3rd and 4th are simply out.
const KNOCKOUT = [
  { num: 49, stage: 'R16', t1: 'Winner Group A', t2: 'Runner-up Group C' },
  { num: 50, stage: 'R16', t1: 'Winner Group C', t2: 'Runner-up Group A' },
  { num: 51, stage: 'R16', t1: 'Winner Group E', t2: 'Runner-up Group G' },
  { num: 52, stage: 'R16', t1: 'Winner Group G', t2: 'Runner-up Group E' },
  { num: 53, stage: 'R16', t1: 'Winner Group B', t2: 'Runner-up Group D' },
  { num: 54, stage: 'R16', t1: 'Winner Group D', t2: 'Runner-up Group B' },
  { num: 55, stage: 'R16', t1: 'Winner Group F', t2: 'Runner-up Group H' },
  { num: 56, stage: 'R16', t1: 'Winner Group H', t2: 'Runner-up Group F' },
  { num: 57, stage: 'QF', t1: 'Winner Match 49', t2: 'Winner Match 51' },
  { num: 58, stage: 'QF', t1: 'Winner Match 50', t2: 'Winner Match 52' },
  { num: 59, stage: 'QF', t1: 'Winner Match 53', t2: 'Winner Match 55' },
  { num: 60, stage: 'QF', t1: 'Winner Match 54', t2: 'Winner Match 56' },
  { num: 61, stage: 'SF', t1: 'Winner Match 57', t2: 'Winner Match 58' },
  { num: 62, stage: 'SF', t1: 'Winner Match 59', t2: 'Winner Match 60' },
  { num: 63, stage: '3rd', t1: 'Loser Match 61', t2: 'Loser Match 62' },
  { num: 64, stage: 'Final', t1: 'Winner Match 61', t2: 'Winner Match 62' },
]

// Flag emoji per team.
const FLAGS = {
  Argentina: '🇦🇷',
  Australia: '🇦🇺',
  Brazil: '🇧🇷',
  Canada: '🇨🇦',
  China: '🇨🇳',
  Colombia: '🇨🇴',
  'Costa Rica': '🇨🇷',
  Denmark: '🇩🇰',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Haiti: '🇭🇹',
  Italy: '🇮🇹',
  Jamaica: '🇯🇲',
  Japan: '🇯🇵',
  Morocco: '🇲🇦',
  Netherlands: '🇳🇱',
  'New Zealand': '🇳🇿',
  Nigeria: '🇳🇬',
  Norway: '🇳🇴',
  Panama: '🇵🇦',
  Philippines: '🇵🇭',
  Portugal: '🇵🇹',
  'Republic of Ireland': '🇮🇪',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  Spain: '🇪🇸',
  Sweden: '🇸🇪',
  Switzerland: '🇨🇭',
  'United States': '🇺🇸',
  Vietnam: '🇻🇳',
  Zambia: '🇿🇲',
}

// Venue metadata keyed by ESPN's venue id.
//
// `name` is the OFFICIAL tournament name, not ESPN's commercial one: FIFA bans
// sponsor naming at its events, so these are the names the matches were played
// and broadcast under. `sponsorName` keeps ESPN's form so the mapping is
// auditable rather than looking like a typo.
//
// `city` carries the dual English / Indigenous naming FIFA published for every
// host city of this tournament.
//
// `tz` is the stadium's own IANA zone, and it genuinely varies across four
// offsets in the southern winter: Pacific/Auckland (+12), the eastern Australian
// zones (+10), Adelaide (+09:30) and Perth (+08). Neither country observes DST
// in July or August, but the zone is stored rather than the offset so a future
// edition in a DST month still resolves correctly.
const VENUE_META = {
  4639: { key: 'stadiumaustralia', name: 'Stadium Australia', sponsorName: 'Accor Stadium', city: 'Sydney / Gadigal', country: 'Australia', tz: 'Australia/Sydney', region: 'New South Wales' },
  5370: { key: 'sydneyfootball', name: 'Sydney Football Stadium', sponsorName: 'Allianz Stadium', city: 'Sydney / Gadigal', country: 'Australia', tz: 'Australia/Sydney', region: 'New South Wales' },
  1800: { key: 'brisbane', name: 'Brisbane Stadium', sponsorName: 'Suncorp Stadium', city: 'Brisbane / Meaanjin', country: 'Australia', tz: 'Australia/Brisbane', region: 'Queensland' },
  5571: { key: 'melbourne', name: 'Melbourne Rectangular Stadium', sponsorName: 'AAMI Park', city: 'Melbourne / Naarm', country: 'Australia', tz: 'Australia/Melbourne', region: 'Victoria' },
  5573: { key: 'perth', name: 'Perth Rectangular Stadium', sponsorName: 'HBF Park', city: 'Perth / Boorloo', country: 'Australia', tz: 'Australia/Perth', region: 'Western Australia' },
  5574: { key: 'hindmarsh', name: 'Hindmarsh Stadium', sponsorName: 'Coopers Stadium', city: 'Adelaide / Tarntanya', country: 'Australia', tz: 'Australia/Adelaide', region: 'South Australia' },
  4603: { key: 'edenpark', name: 'Eden Park', sponsorName: 'Eden Park', city: 'Auckland / Tāmaki Makaurau', country: 'New Zealand', tz: 'Pacific/Auckland', region: 'Auckland' },
  3058: { key: 'wellington', name: 'Wellington Regional Stadium', sponsorName: 'Sky Stadium', city: 'Wellington / Te Whanganui-a-Tara', country: 'New Zealand', tz: 'Pacific/Auckland', region: 'Wellington' },
  4650: { key: 'dunedin', name: 'Dunedin Stadium', sponsorName: 'Forsyth Barr Stadium', city: 'Dunedin / Ōtepoti', country: 'New Zealand', tz: 'Pacific/Auckland', region: 'Otago' },
  4605: { key: 'waikato', name: 'Waikato Stadium', sponsorName: 'FMG Stadium Waikato', city: 'Hamilton / Kirikiriroa', country: 'New Zealand', tz: 'Pacific/Auckland', region: 'Waikato' },
}

// FIFA spells three teams differently from ESPN. ESPN's display form is the
// canonical one (it is what the app shows), so these map FIFA -> canonical.
// Keep this map MINIMAL: an alias whose key never appears in a feed is dead
// weight that can silently rewrite a correct name — see the Copa América repo,
// where an inherited 'United States' -> 'USA' entry dropped every host match.
const ALIASES = {
  'China PR': 'China',
  'Korea Republic': 'South Korea',
  USA: 'United States',
}
const canon = (name) => ALIASES[name] || name

// ---------------------------------------------------------------------------
// ESPN → normalized events
// ---------------------------------------------------------------------------

// "FIFA Women's World Cup, Group A" → "A"; ", Quarterfinals" → null.
function groupOf(competition) {
  const note = competition.altGameNote || ''
  const m = note.match(/Group ([A-L])\s*$/)
  return m ? m[1] : null
}

const STAGE_BY_SLUG = {
  'group-stage': 'Group',
  'round-of-16': 'R16',
  quarterfinals: 'QF',
  semifinals: 'SF',
  '3rd-place': '3rd',
  final: 'Final',
}

// ESPN's `date` is a UTC instant; re-express it in the STADIUM's own timezone,
// so the committed string reads as the local kickoff a spectator at the ground
// saw. There is no single edition-wide offset to use instead: the ten venues run
// on four different ones. The offset is derived from the IANA zone at that
// instant rather than hard-coded, so a future edition played in a DST month
// still comes out right.
function venueOffset(iso, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(iso))
  const name = parts.find((x) => x.type === 'timeZoneName')?.value || 'GMT'
  // "GMT+10", "GMT+09:30", or plain "GMT" at UTC.
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return '+00:00'
  return `${m[1]}${m[2].padStart(2, '0')}:${m[3] || '00'}`
}

function toVenueLocal(iso, tz) {
  const off = venueOffset(iso, tz)
  const sign = off.startsWith('-') ? -1 : 1
  const mins = sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6)))
  const local = new Date(new Date(iso).getTime() + mins * 60_000)
  return local.toISOString().slice(0, 19) + off
}

// Keys used to line an ESPN event up with its FIFA counterpart.
//
// The UTC instant alone is NOT unique: a group's last two matches kick off
// simultaneously (that is the point of them), so the eight final matchdays give
// eight colliding pairs. The team pair alone is not unique either — two teams
// can meet again in the knockout. The two together are.
const koKey = (iso) => new Date(iso).toISOString().slice(0, 16)
const pairKey = (a, b) => [canon(a), canon(b)].sort().join('|')
const matchKey = (iso, a, b) => `${koKey(iso)}|${pairKey(a, b)}`

function normalizeEvent(event) {
  const c = event.competitions[0]
  const stage = STAGE_BY_SLUG[event.season?.slug]
  if (!stage) throw new Error(`Unknown stage slug "${event.season?.slug}" on event ${event.id}`)

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  const venueId = Number(c.venue?.id)
  if (!VENUE_META[venueId]) {
    throw new Error(`Unknown venue ${venueId} (${c.venue?.fullName}) on event ${event.id}`)
  }

  // Goal detail comes from ESPN's own event feed here, the role the sibling
  // builders give OpenFootball. Shootout kicks are excluded: they decide a tie
  // but are not goals, and counting them would break the reconciliation below.
  // An own goal is credited by ESPN to the team that BENEFITS, which is how the
  // scoreline counts it too, so no side-swap is needed.
  const goalsFor = (teamId) =>
    (c.details || [])
      .filter((d) => d.scoringPlay && !d.shootout && String(d.team?.id) === String(teamId))
      .map((d) => {
        const [, base, extra] = /^(\d+)(?:\+(\d+))?/.exec(d.clock?.displayValue || '') || []
        return {
          name: (d.athletesInvolved || [])[0]?.displayName || 'Unknown',
          minute: Number(base || 0),
          ...(extra ? { extra: Number(extra) } : {}),
          ...(d.penaltyKick ? { penalty: true } : {}),
          ...(d.ownGoal ? { og: true } : {}),
        }
      })
      .sort((x, y) => x.minute - y.minute || (x.extra || 0) - (y.extra || 0))

  const scored = home.score !== '' && home.score != null && c.status?.type?.completed
  const pens =
    home.shootoutScore != null && away.shootoutScore != null
      ? [Number(home.shootoutScore), Number(away.shootoutScore)]
      : null

  return {
    espnId: event.id,
    stage,
    group: groupOf(c),
    ko: toVenueLocal(c.date, VENUE_META[venueId].tz),
    key: matchKey(c.date, home.team.displayName, away.team.displayName),
    venue: VENUE_META[venueId].key,
    t1: home.team.displayName,
    t2: away.team.displayName,
    score: scored ? [Number(home.score), Number(away.score)] : null,
    pens,
    // Every knockout tie here plays extra time before penalties, so BOTH ESPN
    // details mean extra time was played: "AET" (decided in it) and "FT-Pens"
    // (survived it, then a shootout). Copa América is the opposite case — only
    // its Final went to extra time — so this line must not be copied between the
    // two repos in either direction.
    aet: /AET|Pens/i.test(c.status?.type?.detail || ''),
    goals: (() => {
      const t1 = goalsFor(home.team.id)
      const t2 = goalsFor(away.team.id)
      return t1.length || t2.length ? { t1, t2 } : undefined
    })(),
  }
}

// ---------------------------------------------------------------------------
// FIFA -> the authority: official match numbers, kickoffs, venues, scores
// ---------------------------------------------------------------------------

const fifaName = (team) => canon(((team || {}).TeamName || [{}])[0]?.Description || '')
const fifaText = (field) => ((field || [{}])[0] || {}).Description || ''

// FIFA reports a 0-0 penalty score on EVERY knockout tie, including the ones
// that never went to a shootout — so a shootout is only real when the match was
// level after extra time AND the penalty scores actually differ. Reading the
// field alone would invent three dozen shootouts.
function fifaPens(m) {
  const h = m.HomeTeamPenaltyScore
  const a = m.AwayTeamPenaltyScore
  if (h == null || a == null || h === a) return null
  if (m.HomeTeamScore !== m.AwayTeamScore) return null
  return [h, a]
}

async function fetchFifa() {
  const data = await getJson(FIFA)
  const rows = data.Results || []
  assert(
    rows.length === EDITION.matches,
    `Expected ${EDITION.matches} matches from FIFA, got ${rows.length}`,
  )
  const byKo = new Map()
  for (const m of rows) {
    const rec = {
      num: m.MatchNumber,
      key: matchKey(m.Date, fifaName(m.Home), fifaName(m.Away)),
      stadium: fifaText((m.Stadium || {}).Name),
      home: fifaName(m.Home),
      away: fifaName(m.Away),
      score:
        m.HomeTeamScore == null || m.AwayTeamScore == null
          ? null
          : [m.HomeTeamScore, m.AwayTeamScore],
      pens: fifaPens(m),
    }
    assert(!byKo.has(rec.key), `Two FIFA matches share kickoff + teams: ${rec.key}`)
    byKo.set(rec.key, rec)
  }
  return byKo
}

// ---------------------------------------------------------------------------

function assert(cond, message) {
  if (!cond) throw new Error(message)
}

// 'YYYY-MM-DD' ± n days, without pulling in a date library.
const shiftDate = (date, days) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)

function buildMatches(events, fifaIndex) {
  assert(
    events.length === EDITION.matches,
    `Expected ${EDITION.matches} matches from ESPN, got ${events.length}. ` +
      `A short read is indistinguishable from a quiet tournament — refusing to write.`,
  )

  // Every match is numbered by FIFA, not inferred. The sibling builders have to
  // guess group numbering from ESPN's id order because their source of record
  // carries no numbers; FIFA publishes the official 1-64, so the join is by
  // kickoff instant and the number simply comes along. That also removes the
  // "ESPN's ids happen to match the fixture order" assumption those builders
  // rest on.
  const slotByNum = new Map(KNOCKOUT.map((k) => [k.num, k]))
  const disagreements = []
  const numbered = events.map((e) => {
    // The join itself is cross-check #1: it succeeds only if both sources agree
    // on the kickoff instant AND the two teams.
    const fifa = fifaIndex.get(e.key)
    assert(
      fifa,
      `No FIFA match at ${e.key} for ESPN event ${e.espnId} ` +
        `(${e.t1} v ${e.t2}) — the two sources disagree on the schedule.`,
    )

    // Cross-check #2: the same final score, oriented onto our (t1, t2).
    if (e.score && fifa.score) {
      const aligned = fifa.home === e.t1
      const theirs = aligned ? fifa.score : [fifa.score[1], fifa.score[0]]
      if (theirs[0] !== e.score[0] || theirs[1] !== e.score[1]) {
        disagreements.push(
          `match ${fifa.num} ${e.t1} v ${e.t2}: ESPN ${e.score.join('-')} vs ` +
            `FIFA ${theirs.join('-')}`,
        )
      }
    }

    // Cross-check #3: the same venue. ESPN files these under sponsor names, so
    // compare against the sponsor form we recorded alongside the official one.
    const meta = Object.values(VENUE_META).find((v) => v.key === e.venue)
    if (fifa.stadium && meta && fifa.stadium !== meta.name) {
      disagreements.push(
        `match ${fifa.num}: ESPN venue ${meta.name} (${meta.sponsorName}) vs FIFA ${fifa.stadium}`,
      )
    }

    const slot = slotByNum.get(fifa.num)
    if (e.stage === 'Group') {
      assert(!slot, `FIFA numbers group match ${fifa.num} into the knockout table`)
    } else {
      assert(slot, `No knockout slot defined for match ${fifa.num} (${e.stage})`)
      assert(
        slot.stage === e.stage,
        `Match ${fifa.num} expected stage ${slot.stage}, ESPN says ${e.stage}`,
      )
    }

    return {
      ...e,
      num: fifa.num,
      // Placeholder labels survive only while a match is unplayed; once it has a
      // result the real teams are what both sources report.
      ...(slot ? { label1: slot.t1, label2: slot.t2 } : {}),
    }
  })

  assert(
    new Set(numbered.map((m) => m.num)).size === EDITION.matches,
    'Duplicate match numbers after numbering',
  )
  assert(
    disagreements.length === 0,
    `ESPN and FIFA disagree on ${disagreements.length} match(es):\n  ` +
      disagreements.join('\n  '),
  )

  // Third, independent check: a scorer list that doesn't add up to the scoreline
  // means ESPN's event feed dropped or invented a goal. Own goals are credited
  // to the team that benefits, which is how the scoreline counts them too.
  const goalMismatch = []
  for (const m of numbered) {
    if (!m.score || !m.goals) continue
    const [a, b] = [m.goals.t1.length, m.goals.t2.length]
    if (a !== m.score[0] || b !== m.score[1]) {
      goalMismatch.push(`match ${m.num} ${m.t1} v ${m.t2}: score ${m.score.join('-')} but ${a}-${b} scorers`)
    }
  }
  assert(
    goalMismatch.length === 0,
    `Goal detail does not reconcile with the scoreline on ${goalMismatch.length} match(es):\n  ` +
      goalMismatch.join('\n  '),
  )

  return numbered.sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)
}

function buildTeams(matches) {
  const groups = {}
  for (const m of matches) {
    if (m.stage !== 'Group') continue
    for (const name of [m.t1, m.t2]) {
      assert(FLAGS[name], `No flag for team "${name}" — add it to FLAGS`)
      groups[m.group] ??= []
      if (!groups[m.group].some((t) => t.name === name)) {
        groups[m.group].push({ name, flag: FLAGS[name] })
      }
    }
  }
  const letters = Object.keys(groups).sort()
  assert(
    letters.join('') === EDITION.groups.join(''),
    `Expected groups ${EDITION.groups.join('')}, got ${letters.join('')}`,
  )
  for (const g of letters) {
    assert(groups[g].length === 4, `Group ${g} has ${groups[g].length} teams, expected 4`)
    groups[g].sort((a, b) => a.name.localeCompare(b.name))
  }
  const total = letters.reduce((n, g) => n + groups[g].length, 0)
  assert(total === EDITION.teams, `Expected ${EDITION.teams} teams, got ${total}`)
  // Emit in group order, not in the order the fixture list happened to introduce
  // them — Object.keys(TEAMS) is the group order the whole app iterates in.
  return Object.fromEntries(letters.map((g) => [g, groups[g]]))
}

function buildVenues(matches) {
  const used = new Set(matches.map((m) => m.venue))
  assert(used.size === EDITION.venues, `Expected ${EDITION.venues} venues, got ${used.size}`)
  const out = {}
  for (const meta of Object.values(VENUE_META)) {
    if (!used.has(meta.key)) continue
    out[meta.key] = {
      name: meta.name,
      city: meta.city,
      country: EDITION.host,
      countryFlag: EDITION.hostFlag,
      tz: meta.tz,
      region: meta.region,
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const BANNER = (what) =>
  `// GENERATED by scripts/fetch-tournament.mjs — do not edit by hand.\n` +
  `// ${what}\n` +
  `// Sources: FIFA's own API (the authority: official match numbers, kickoffs,\n` +
  `// venues, scores) + ESPN (event ids, group labels, goal scorers). The build\n` +
  `// fails unless the two agree on all 64 kickoffs, venues and scores. There is\n` +
  `// no OpenFootball feed for this edition — it publishes the MEN'S World Cups\n` +
  `// only — so FIFA takes the "source of record" role the siblings give it.\n` +
  `// Regenerate with: npm run fetch:tournament\n`

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function goalLiteral(g) {
  const bits = [`name: ${q(g.name)}`, `minute: ${g.minute}`]
  if (g.penalty) bits.push('penalty: true')
  if (g.og) bits.push('og: true')
  return `{ ${bits.join(', ')} }`
}

function matchLiteral(m) {
  const bits = [`num: ${m.num}`, `stage: ${q(m.stage)}`]
  if (m.group) bits.push(`group: ${q(m.group)}`)
  bits.push(`t1: ${q(m.t1)}`, `t2: ${q(m.t2)}`)
  if (m.label1) bits.push(`label1: ${q(m.label1)}`, `label2: ${q(m.label2)}`)
  bits.push(`venue: ${q(m.venue)}`, `ko: ${q(m.ko)}`, `espnId: ${q(m.espnId)}`)
  if (m.score) bits.push(`score: [${m.score.join(', ')}]`)
  if (m.aet) bits.push('aet: true')
  if (m.pens) bits.push(`pens: [${m.pens.join(', ')}]`)
  let line = `  { ${bits.join(', ')} }`
  if (m.goals) {
    const t1 = m.goals.t1.map(goalLiteral).join(', ')
    const t2 = m.goals.t2.map(goalLiteral).join(', ')
    line = `  {\n    ${bits.join(', ')},\n` + `    goals: { t1: [${t1}], t2: [${t2}] },\n  }`
  }
  return line
}

function renderMatches(matches) {
  const champion = championOf(matches)
  return (
    BANNER(
      `All ${matches.length} matches of the FIFA Women's World Cup ${EDITION.year} in ${EDITION.host}.`,
    ) +
    `//\n` +
    `// \`ko\` is the kickoff instant as an ISO 8601 string carrying its OWN venue's\n` +
    `// offset. There is deliberately no single tournament offset: the ${EDITION.venues}\n` +
    `// host stadiums span two countries and four southern-winter offsets (+12 New\n` +
    `// Zealand, +10 eastern Australia, +09:30 Adelaide, +08 Perth), so no one\n` +
    `// "local time" exists for the edition. Because each offset is explicit,\n` +
    `// \`new Date(ko)\` resolves to the correct absolute instant and can be\n` +
    `// formatted into ANY timezone — that is what powers both the "in your\n` +
    `// timezone" display and the per-venue local kickoff.\n` +
    `//\n` +
    `// \`label1\`/\`label2\` on a knockout match are the bracket placeholders the\n` +
    `// fixture list was drawn with ("Winner Group A"). They are kept alongside the\n` +
    `// resolved teams so the bracket can show a slot's provenance, and so an\n` +
    `// unplayed edition renders from the same records.\n` +
    `//\n` +
    `// \`aet\` marks extra time, and here \`pens\` ALWAYS implies it: every level\n` +
    `// knockout tie played extra time first, so a shootout can only follow one.\n` +
    `// Four ties went to extra time (52, 54, 57, 59) and three of those went on to\n` +
    `// penalties (52, 54, 59); match 57 was settled in extra time itself. This is\n` +
    `// the exact opposite of Copa América 2024, where \`pens\` without \`aet\` is the\n` +
    `// correct shape — the two must never be copied between the repos.\n` +
    `//\n` +
    `// \`espnId\` is the ESPN event id, which the match detail modal uses to fetch\n` +
    `// that match's lineups and box score on demand rather than committing them.\n` +
    `//\n` +
    `// Champion: ${champion}.\n` +
    `\n` +
    `export const STAGE_LABELS = {\n` +
    `  Group: 'Group Stage',\n` +
    `  R16: 'Round of 16',\n` +
    `  QF: 'Quarter-final',\n` +
    `  SF: 'Semi-final',\n` +
    `  '3rd': 'Third-place play-off',\n` +
    `  Final: 'Final',\n` +
    `}\n\n` +
    `export const STAGE_ORDER = ['Group', 'R16', 'QF', 'SF', '3rd', 'Final']\n\n` +
    `export const MATCHES = [\n` +
    matches.map(matchLiteral).join(',\n') +
    `,\n].sort((a, b) => new Date(a.ko) - new Date(b.ko) || a.num - b.num)\n`
  )
}

function championOf(matches) {
  const final = matches.find((m) => m.stage === 'Final')
  if (!final?.score) return 'not yet decided'
  const [a, b] = final.pens || final.score
  return a === b ? 'not yet decided' : a > b ? final.t1 : final.t2
}

function renderTeams(groups) {
  const body = Object.entries(groups)
    .map(
      ([g, teams]) =>
        `  ${g}: [\n` +
        teams.map((t) => `    { name: ${q(t.name)}, flag: ${q(t.flag)} },`).join('\n') +
        `\n  ],`,
    )
    .join('\n')
  return (
    BANNER(
      `The ${EDITION.teams} teams of the FIFA Women's World Cup ${EDITION.year}, in their group-stage groups.`,
    ) +
    `\nexport const TEAMS = {\n${body}\n}\n\n` +
    `// Flat lookup: team name -> flag emoji.\n` +
    `export const FLAG_BY_TEAM = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .reduce((acc, t) => {\n` +
    `    acc[t.name] = t.flag\n` +
    `    return acc\n` +
    `  }, {})\n\n` +
    `// Sorted list of all team names (for the team filter).\n` +
    `export const ALL_TEAMS = Object.values(TEAMS)\n` +
    `  .flat()\n` +
    `  .map((t) => t.name)\n` +
    `  .sort((a, b) => a.localeCompare(b))\n`
  )
}

function renderVenues(venues) {
  const body = Object.entries(venues)
    .map(
      ([key, v]) =>
        `  ${key}: {\n` +
        `    name: ${q(v.name)},\n` +
        `    city: ${q(v.city)},\n` +
        `    country: ${q(v.country)},\n` +
        `    countryFlag: ${q(v.countryFlag)},\n` +
        `    tz: ${q(v.tz)},\n` +
        `    region: ${q(v.region)},\n` +
        `  },`,
    )
    .join('\n')
  return (
    BANNER(`The ${EDITION.venues} host venues of the FIFA Women's World Cup ${EDITION.year}.`) +
    `// \`tz\` is the IANA timezone of the stadium, used to show local kickoff time.\n` +
    `// These genuinely differ across a CO-HOSTED edition: New Zealand (+12) plus\n` +
    `// eastern Australia (+10), Adelaide (+09:30) and Perth (+08). All four are\n` +
    `// southern-winter standard time, so no venue observed DST during the finals.\n` +
    `// \`region\` groups the host cities geographically for the venue filter: the\n` +
    `// Australian state or the New Zealand region, since \`country\` is one combined\n` +
    `// string for every venue and cannot separate the two hosts.\n` +
    `\nexport const VENUES = {\n${body}\n}\n`
  )
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Women's World Cup ${EDITION.year} — fetching ESPN + FIFA…`)

  const [espnDoc, fifaIndex] = await Promise.all([
    getJson(`${ESPN}/scoreboard?dates=${EDITION.window}&limit=200`),
    fetchFifa(),
  ])

  const events = (espnDoc.events || []).map(normalizeEvent)
  console.log(`  ESPN: ${events.length} events · FIFA: ${fifaIndex.size} matches`)

  const matches = buildMatches(events, fifaIndex)
  const teams = buildTeams(matches)
  const venues = buildVenues(matches)

  const withGoals = matches.filter((m) => m.goals).length
  const scorers = matches.reduce(
    (n, m) => n + (m.goals ? m.goals.t1.length + m.goals.t2.length : 0),
    0,
  )
  console.log(
    `  ${matches.length} matches · ${Object.keys(teams).length} groups · ` +
      `${Object.keys(venues).length} venues · ${withGoals} with goal detail (${scorers} goals)`,
  )
  console.log(`  Champion: ${championOf(matches)}`)

  const files = [
    ['src/data/matches.js', renderMatches(matches)],
    ['src/data/teams.js', renderTeams(teams)],
    ['src/data/venues.js', renderVenues(venues)],
  ]

  for (const [rel, text] of files) {
    const path = join(ROOT, rel)
    let before = ''
    try {
      before = readFileSync(path, 'utf8')
    } catch {
      // new file
    }
    if (before === text) {
      console.log(`  = ${rel} unchanged`)
      continue
    }
    if (DRY) {
      console.log(`  ~ ${rel} would change (${before.length} → ${text.length} bytes)`)
      continue
    }
    writeFileSync(path, text)
    console.log(`  ✓ ${rel} written (${text.length} bytes)`)
  }
}

main().catch((err) => {
  console.error(`\nfetch-tournament failed:\n  ${err.message}\n`)
  process.exit(1)
})
