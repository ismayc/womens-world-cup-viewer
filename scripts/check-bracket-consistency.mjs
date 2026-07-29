// Bracket-consistency guard: assert that OUR bracket code, fed only the group
// results, reproduces the REAL knockout matchups.
//
// It reruns the whole chain — group tables and tie-breakers (qualification.js),
// clinch detection (clinch.js), then slot resolution and winner/loser
// propagation (bracketResolve.js) — from a board whose knockout sides are back
// to their drawn placeholders, and compares every resulting matchup against
// FIFA's own record of who actually played whom.
//
// So if the tie-breaker order, the group-slot mapping, or the knockout
// propagation ever drifts, this fails against the real tournament rather than
// against our own committed answer. FIFA is the authority the sibling
// world-cup-viewer validates against too.
//
// Note this is a genuine cross-check, not a tautology: the committed matches.js
// already names the real knockout teams, so comparing it to FIFA would prove
// nothing. The placeholders are restored first (see `blank` below) precisely so
// the bracket has to be *derived*.
//
// Run:  node scripts/check-bracket-consistency.mjs   (alias: npm run check:bracket)

import { MATCHES } from '../src/data/matches.js'
import { computeClinch } from '../src/utils/clinch.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'

const FIFA =
  'https://api.fifa.com/api/v3/calendar/matches?idCompetition=103&idSeason=285026&count=200&language=en'
const ALIASES = { 'China PR': 'China', 'Korea Republic': 'South Korea', USA: 'United States' }
const canon = (n) => ALIASES[n] || n
const pair = (a, b) => [a, b].sort().join(' v ')

const res = await fetch(FIFA).catch((e) => {
  console.log(`⚠ FIFA unreachable (${e.message}); skipping bracket check this run.`)
  return null
})
if (!res || !res.ok) {
  console.log('⚠ FIFA unreachable; skipping bracket check this run.')
  process.exit(0)
}
const rows = (await res.json()).Results || []
const official = new Map()
for (const m of rows) {
  const name = (t) => canon(((t || {}).TeamName || [{}])[0]?.Description || '')
  official.set(m.MatchNumber, pair(name(m.Home), name(m.Away)))
}

// Restore the drawn placeholders so the bracket must be derived, not read back.
const blank = MATCHES.map((m) =>
  m.label1 ? { ...m, t1: m.label1, t2: m.label2, score: undefined, pens: undefined, aet: undefined } : m,
)
// …then replay the knockout results round by round, so each round's winners can
// feed the next exactly as they did live.
let cur = resolveBracket(blank, computeClinch(blank))
for (let pass = 0; pass < 6; pass++) {
  cur = cur.map((m) => {
    if (m.score || !m.label1) return m
    const real = MATCHES.find((x) => x.num === m.num)
    return real.score ? { ...m, score: real.score, pens: real.pens, aet: real.aet } : m
  })
  cur = resolveBracket(cur, computeClinch(cur))
}

const divergences = []
let compared = 0
for (const m of cur) {
  if (!m.label1) continue
  const want = official.get(m.num)
  if (!want) continue
  compared++
  const got = pair(m.t1, m.t2)
  if (got !== want) divergences.push(`match ${m.num}: we resolve ${got}, FIFA says ${want}`)
}

if (!compared) {
  console.error('✗ Bracket consistency: nothing was compared — the check proved nothing.')
  process.exit(1)
}
if (divergences.length) {
  console.error(`✗ Bracket consistency: ${divergences.length} divergence(s) vs FIFA:`)
  for (const d of divergences) console.error('  ' + d)
  process.exit(1)
}
console.log(
  `Bracket consistency: ${compared} knockout matchup(s) re-derived from the group ` +
    `results and matched against FIFA | 0 divergence(s)`,
)
