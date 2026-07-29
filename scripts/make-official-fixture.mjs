// Regenerates test/fixtures/official-kickoffs.js — the authoritative fixture the
// committed schedule is tested against.
//
// The point of the fixture is that it states the tournament from a DIFFERENT
// feed than the one that shapes src/data/matches.js. The builder
// (scripts/fetch-tournament.mjs) takes its structure, event ids and scores from
// ESPN; this takes kickoff, stadium, group and round from FIFA's own match
// calendar. test/data.test.js then asserts the two independently-sourced views
// of the same tournament agree — so a silent shift in either feed fails the
// suite instead of quietly rewriting history.
//
// HONEST LIMIT OF THE CROSS-CHECK. fetch-tournament.mjs already validates the
// ESPN structure against FIFA at BUILD time, so this fixture is not a fully
// independent third opinion the way the sibling viewers' OpenFootball fixture
// was. What it adds is a FROZEN, committed record of that agreement: the build
// check only runs when someone regenerates the data, whereas this runs on every
// test run, and it fails if either feed later moves. Treat a disagreement as the
// finding, not as something to patch away by editing this file alone.
//
// NO SINGLE TOURNAMENT TIMEZONE. The sibling viewers restate every kickoff in
// the one zone their organiser published in. This edition has four (+08:00 Perth,
// +09:30 Adelaide, +10:00 eastern Australia, +12:00 New Zealand), so kickoffs are
// stated here as full ISO instants carrying the VENUE's own offset — directly
// comparable to how src/data/matches.js stores `ko`, with nothing to convert and
// so nothing to get wrong in the conversion.
//
// Venues are keyed by stadium name, using FIFA's official (unsponsored) naming,
// which is what the committed venue table uses too — FIFA bans sponsor names at
// its own events, so ESPN's commercial names (Accor, Sky, Suncorp, AAMI, HBF,
// Coopers, Forsyth Barr, FMG) never appear here.
//
// Node built-ins only.
//
//   node scripts/make-official-fixture.mjs

import { writeFileSync } from 'node:fs'

const FIFA =
  'https://api.fifa.com/api/v3/calendar/matches?idCompetition=103&idSeason=285026&count=200&language=en'

// FIFA spellings that differ from ours. Deliberately minimal — the same three
// the data builder applies, and no more: an unmapped spelling must fail loudly
// as an unknown team rather than being quietly normalised into a wrong one.
const TEAM_ALIASES = {
  'China PR': 'China',
  'Korea Republic': 'South Korea',
  USA: 'United States',
}

// FIFA stage descriptions -> our stage codes.
const STAGE = {
  'First Stage': 'Group',
  'Round of 16': 'R16',
  'Quarter-final': 'QF',
  'Quarter-finals': 'QF',
  'Semi-final': 'SF',
  'Semi-finals': 'SF',
  'Play-off for third place': '3rd',
  Final: 'Final',
}

const en = (v) => (Array.isArray(v) ? v[0]?.Description?.trim() : v?.trim())
const team = (side) => {
  const n = en(side?.TeamName) || side?.ShortClubName
  return TEAM_ALIASES[n] || n
}

// FIFA states LocalDate as venue wall-clock time but stamps it 'Z'; Date is the
// true UTC instant. The venue's offset is the difference between them, which is
// how we recover a correct ISO instant without hard-coding a zone per stadium.
function venueIso(utc, local) {
  const offMin = Math.round((Date.parse(local) - Date.parse(utc)) / 60000)
  const sign = offMin < 0 ? '-' : '+'
  const abs = Math.abs(offMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${local.replace(/Z$/, '')}${sign}${hh}:${mm}`
}

const res = await fetch(FIFA)
if (!res.ok) {
  console.error(`✗ FIFA unreachable (HTTP ${res.status}). Not rewriting the fixture.`)
  process.exit(1)
}
const { Results: rows } = await res.json()
if (!Array.isArray(rows) || rows.length !== 64) {
  console.error(`✗ FIFA returned ${rows?.length} matches, expected 64. Not rewriting the fixture.`)
  process.exit(1)
}

const ko = {}
const stadium = {}
const groups = {}
const matchGroup = {}
const round = {}
const unknownStages = new Set()

for (const m of rows.sort((a, b) => a.MatchNumber - b.MatchNumber)) {
  const t1 = team(m.Home)
  const t2 = team(m.Away)
  const iso = venueIso(m.Date, m.LocalDate)
  const key = `${iso.slice(0, 10)}|${[t1, t2].sort().join('|')}`

  const stageName = en(m.StageName)
  if (!STAGE[stageName]) unknownStages.add(stageName)

  ko[key] = iso
  stadium[key] = en(m.Stadium?.Name)
  round[key] = STAGE[stageName] || stageName
  const g = en(m.GroupName)
  if (g) {
    const letter = g.replace(/^Group\s+/, '')
    matchGroup[key] = letter
    ;(groups[letter] ||= new Set()).add(t1).add(t2)
  }
}

if (unknownStages.size) {
  console.error(`✗ Unmapped FIFA stage name(s): ${[...unknownStages].join(', ')}`)
  process.exit(1)
}
if (Object.keys(ko).length !== 64) {
  console.error(`✗ ${Object.keys(ko).length} distinct keys from 64 matches — a join key collided.`)
  process.exit(1)
}

const entries = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n')

const out = `// GENERATED by scripts/make-official-fixture.mjs — do not edit by hand.
//
// Authoritative kickoff instant, stadium, group and round for every match of the
// 2023 FIFA Women's World Cup, keyed by kickoff date + sorted team pair.
//
// Source: FIFA's own match calendar (idCompetition=103, idSeason=285026). This
// is a different feed from the one that shapes src/data/matches.js (ESPN), so
// test/data.test.js comparing them is a cross-check rather than a restatement.
// See scripts/make-official-fixture.mjs for the honest limit of that claim.
//
// NO SINGLE TOURNAMENT TIMEZONE: the 10 host stadiums span +08:00, +09:30,
// +10:00 and +12:00, so each kickoff is a full ISO instant carrying its OWN
// venue's offset — the same way src/data/matches.js stores it.
//
// Stadium names are FIFA's official, unsponsored ones (FIFA bans sponsor naming
// at its events), matching src/data/venues.js.
//
// Regenerate with: npm run fixture:official

// Matches where the committed schedule deliberately differs from the published
// fixture, with the reason. The export stays even when empty so a future
// divergence has somewhere to be recorded and asserted, rather than being
// silently absorbed.
export const SCHEDULED_NOT_ACTUAL = {}

export const OFFICIAL_KO = {
${entries(ko)}
}

export const OFFICIAL_STADIUM = {
${entries(stadium)}
}

// The official group draw: group letter -> its four teams.
export const OFFICIAL_GROUPS = {
${Object.entries(groups)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([g, set]) => `  ${JSON.stringify(g)}: ${JSON.stringify([...set].sort())},`)
  .join('\n')}
}

// Per-match group letter, for checking each fixture is filed under the right one.
export const OFFICIAL_MATCH_GROUP = {
${entries(matchGroup)}
}

export const OFFICIAL_ROUND = {
${entries(round)}
}
`

writeFileSync(new URL('../test/fixtures/official-kickoffs.js', import.meta.url), out)
console.log(
  `✓ official-kickoffs.js regenerated from FIFA: ${Object.keys(ko).length} matches, ` +
    `${new Set(Object.values(stadium)).size} stadiums, ${new Set(Object.values(groups)).size} groups`,
)
