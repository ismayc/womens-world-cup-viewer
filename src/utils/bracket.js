// Knockout bracket layout. The "Winner Match N" feed labels don't line up by
// adjacent match number, so we hard-order each round so that the boxes that
// feed a later box sit next to each other vertically — producing a readable
// two-sided bracket that meets at the Final.

import { FLAG_BY_TEAM } from '../data/teams.js'
import { MATCHES } from '../data/matches.js'
import { ENTRY_ROUND, entryMatches, slotLabels, WINNER_GROUP, RUNNERUP_GROUP, WINNER_MATCH } from './slots.js'

// A still-unresolved feed slot ("Winner Match 25" / "Loser Match 29") expands to
// the two teams of the tie it feeds from, ONCE that tie has both real teams — the
// "potential matchup" (e.g. "🇺🇾 Uruguay / 🇧🇷 Brazil"). Returns { a, b, kind, num }
// or null for a real team, a non-feed label, or a source tie not yet resolved.
// `byNum` maps match number → (resolved) match. Used by the bracket + the
// Schedule/Week cards so an upcoming knockout reads as its candidate pairing.
const FEED_LABEL = /^(Winner|Loser) Match (\d+)$/
export function feederTeams(label, byNum) {
  const hit = FEED_LABEL.exec(label)
  if (!hit || !byNum) return null
  const fm = byNum[Number(hit[2])]
  if (!fm || !FLAG_BY_TEAM[fm.t1] || !FLAG_BY_TEAM[fm.t2]) return null
  return { a: fm.t1, b: fm.t2, kind: hit[1], num: fm.num }
}

// Each round is ordered so that the two boxes feeding a later box sit next to
// each other, which is what makes the two sides meet at the Final. FIFA's match
// numbering is NOT in bracket order — QF 57 is fed by Round-of-16 matches 49 and
// 51, not 49 and 50 — so this ordering is stated explicitly rather than derived
// from the numbers.
//
// Unlike the European Championship, which dropped it after 1980, the Women's
// World Cup still plays a third-place play-off: match 63, between the two beaten
// semi-finalists. It hangs off the bracket rather than sitting in it, so it gets
// its own key.
export const BRACKET = {
  left: {
    R16: [49, 51, 50, 52],
    QF: [57, 58],
    SF: [61],
  },
  final: [64],
  right: {
    SF: [62],
    QF: [59, 60],
    R16: [53, 55, 54, 56],
  },
  third: [63],
}

export function matchesByNum(matches) {
  return matches.reduce((acc, m) => {
    acc[m.num] = m
    return acc
  }, {})
}

// Map each group letter to the round-of-16 tie its winner / runner-up feed into,
// parsed from the entry-round placeholder labels ("Winner Group A" etc.). With
// only the top two advancing, every group has exactly these two routes and no
// conditional third-place one.
export function groupSlotMap(matches) {
  const map = {}
  const slot = (g) => (map[g] ||= { win: null, runnerUp: null })
  for (const m of entryMatches(matches)) {
    for (const side of slotLabels(m)) {
      let hit = WINNER_GROUP.exec(side)
      if (hit) { slot(hit[1]).win = m.num; continue }
      hit = RUNNERUP_GROUP.exec(side)
      if (hit) slot(hit[1]).runnerUp = m.num
    }
  }
  return map
}

// Static winner-advancement edges: child match number → the match its WINNER
// feeds into. Parsed once from the original "Winner Match N" labels (a played
// match holds real teams in t1/t2, so we read the invariant fixture labels). The
// Final has no parent, and neither does the third-place play-off — its own
// winner advances nowhere, and it is fed by "Loser Match N", not "Winner Match N".
const KO_WINNER_PARENT = (() => {
  const parent = {}
  for (const m of MATCHES) {
    for (const side of slotLabels(m)) {
      const hit = WINNER_MATCH.exec(side)
      if (hit) parent[Number(hit[1])] = m.num
    }
  }
  return parent
})()

// Winner of a FINAL knockout tie (penalties break a draw); null while the match
// is live, voided, or otherwise unsettled. A local mirror of decideMatch's
// winner rule, kept here to avoid dragging the whole resolver into this widely
// imported module.
function koWinner(m) {
  if (!m || !Array.isArray(m.score) || m.live || m.voided) return null
  const [a, b] = m.score
  if (a > b) return m.t1
  if (b > a) return m.t2
  const p = m.pens
  if (p && p[0] != null && p[1] != null && p[0] !== p[1]) return p[0] > p[1] ? m.t1 : m.t2
  return null
}

// Real teams that have reached the round of 16 (a knockout slot filled with an
// actual team), sorted — the candidates for a "path to the Final" trace.
export function knockoutTeams(byNum) {
  const set = new Set()
  for (const m of entryMatches(Object.values(byNum))) {
    for (const t of [m.t1, m.t2]) if (FLAG_BY_TEAM[t]) set.add(t)
  }
  return [...set].sort()
}

// Trace one team's route through the knockout bracket, from its round-of-16 tie
// inward to the Final. The route is structural (fixed by the bracket topology),
// so it exists whether the team is still alive or already out. Returns:
//   nums    — the full route, R16 → Final (match numbers, outer to inner)
//   here    — the route matches the team is actually a participant in
//   exitNum — the match where the team was knocked out, or null (alive/champion)
//   active  — the stretch of the route to highlight: the whole route while the
//             team is alive, or only through its exit once eliminated
// Returns null when the team isn't (yet) in the round of 16. The third-place
// play-off is deliberately not part of a route: it is a consolation branch off
// the semi-final, not a step toward the trophy.
export function pathToFinal(team, byNum) {
  if (!team) return null
  const entry = Object.values(byNum).find(
    (m) => m.stage === ENTRY_ROUND && (m.t1 === team || m.t2 === team),
  )
  if (!entry) return null
  const nums = []
  for (let cur = entry.num; cur != null; cur = KO_WINNER_PARENT[cur]) nums.push(cur)
  const here = nums.filter((n) => {
    const m = byNum[n]
    return m && (m.t1 === team || m.t2 === team)
  })
  let exitNum = null
  for (const n of here) {
    const w = koWinner(byNum[n])
    if (w && w !== team) { exitNum = n; break }
  }
  const active = exitNum == null ? nums : nums.slice(0, nums.indexOf(exitNum) + 1)
  return { team, nums, here, exitNum, active }
}
