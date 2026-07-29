// Group ranking + qualification using the official FIFA Women's World Cup 2023
// tie-breakers (FWWC2023 Regulations). Criteria, applied to teams level on
// points:
//   1. Points in all group matches
//   Then, among teams still level, over ALL group matches:
//   2. Goal difference
//   3. Goals scored
//   Then, among teams still level, over matches BETWEEN THEM only:
//   4. Head-to-head points
//   5. Head-to-head goal difference
//   6. Head-to-head goals scored
//   Then:
//   7. Fair play points (see conductDelta)
//   8. Drawing of lots
//
// NOTE the order: overall goal difference comes BEFORE head-to-head. That is the
// opposite of the Euro AND of the 2026 men's World Cup, which FIFA reordered to
// head-to-head-first — so this file deliberately does NOT match its sibling in
// world-cup-viewer. Getting it backwards silently reorders any group where two
// level teams drew with each other. Group H is the live proof: Morocco BEAT
// Colombia 1–0 yet finished below them, on goal difference.
//
// Criterion 7 is computed BEST-EFFORT from ESPN's card feed as a single
// `conduct` score (see conductDelta). ESPN can't always tell a second yellow
// from a direct red, and a card-less match scores 0, so treat it as approximate.
//
// Criterion 8 is a drawing of lots, which is an event and not a computation. A
// stable alphabetical order stands in for it so the table is deterministic, and
// the tie-break explainer says outright that the real tie would go to lots.
// (The 2026 men's edition replaced lots with FIFA ranking; 2023 did not, so
// there is no fifaRanking.js counterpart here.)
//
// Only the TOP TWO of each group advance — to the Round of 16. There is no
// best-third qualification (the Euro's `bestThirds` machinery has no counterpart
// here): a group's 3rd and 4th are eliminated.

import { TEAMS } from '../data/teams.js'

const GROUPS = Object.keys(TEAMS)
const GROUP_MATCH_COUNT = 6 // 4 teams => 6 matches per group

// How many teams advance from each group. Eight groups of four, top two each —
// the sixteen Round-of-16 sides. The single source of truth for the clinch,
// elimination and projection engines, which all import it from here.
export const ADVANCING_PER_GROUP = 2

// Criterion 8 stand-in: FIFA settles a total tie by drawing lots, which no
// viewer can compute. Alphabetical order keeps the table stable and repeatable;
// utils/tiebreakNotes.js surfaces "would have gone to lots" wherever it bites.
export const byLots = (a, b) => a.localeCompare(b)

function blank(team, group) {
  return { ...team, group, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0, conduct: 0 }
}

// Fair play points (criterion 7). FIFA's scale is ADDITIVE, not lexicographic:
// yellow −1, indirect red (second yellow) −3, direct red −4, yellow + direct red
// −5 — so four yellows really do cost the same as one direct red. Do not port
// Copa América's "a red outranks any number of yellows" encoding back into this
// file; the two competitions score conduct differently.
//
// Best-effort: ESPN's feed flags yellow/red only, so a second yellow (−3) can't
// be told from a direct red and is scored −4; and a match with no card data
// scores 0. Treat the value as an approximation rather than gospel.
function conductDelta(cards) {
  if (!Array.isArray(cards)) return 0
  return cards.reduce((s, c) => s + (c.color === 'red' ? -4 : -1), 0)
}

function baseStats(group, matches) {
  const rows = {}
  for (const t of TEAMS[group]) rows[t.name] = blank(t, group)
  for (const m of matches) {
    if (m.stage !== 'Group' || m.group !== group || !m.score || m.voided) continue
    const [g1, g2] = m.score
    const a = rows[m.t1]
    const b = rows[m.t2]
    if (!a || !b) continue
    a.P++; b.P++
    a.GF += g1; a.GA += g2
    b.GF += g2; b.GA += g1
    a.conduct += conductDelta(m.cards?.t1)
    b.conduct += conductDelta(m.cards?.t2)
    if (g1 > g2) { a.W++; b.L++; a.Pts += 3 }
    else if (g1 < g2) { b.W++; a.L++; b.Pts += 3 }
    else { a.D++; b.D++; a.Pts++; b.Pts++ }
  }
  for (const k in rows) rows[k].GD = rows[k].GF - rows[k].GA
  return rows
}

// Head-to-head sub-table among exactly the given (tied) team names.
export function headToHead(names, group, matches) {
  const set = new Set(names)
  const sub = {}
  for (const n of names) sub[n] = { Pts: 0, GD: 0, GF: 0 }
  for (const m of matches) {
    if (m.stage !== 'Group' || m.group !== group || !m.score) continue
    if (!set.has(m.t1) || !set.has(m.t2)) continue
    const [g1, g2] = m.score
    sub[m.t1].GF += g1; sub[m.t2].GF += g2
    sub[m.t1].GD += g1 - g2; sub[m.t2].GD += g2 - g1
    if (g1 > g2) sub[m.t1].Pts += 3
    else if (g1 < g2) sub[m.t2].Pts += 3
    else { sub[m.t1].Pts++; sub[m.t2].Pts++ }
  }
  return sub
}

// Order teams that are level on points per FIFA's criteria: overall goal
// difference and goals scored FIRST, and only then the head-to-head sub-table
// among whatever teams are still exactly level.
function resolveLevelOnPoints(tied, group, matches) {
  if (tied.length === 1) return tied

  // Criteria 2–3: overall goal difference, then overall goals scored.
  const sorted = [...tied].sort((a, b) => b.GD - a.GD || b.GF - a.GF)

  const out = []
  let i = 0
  while (i < sorted.length) {
    let j = i + 1
    while (j < sorted.length && sorted[j].GD === sorted[i].GD && sorted[j].GF === sorted[i].GF) j++
    const cluster = sorted.slice(i, j)
    if (cluster.length > 1) {
      // Criteria 4–6, on a sub-table of only these still-level teams, then fair
      // play points, then the stand-in for the drawing of lots.
      const sub = headToHead(cluster.map((t) => t.name), group, matches)
      out.push(
        ...[...cluster].sort(
          (a, b) =>
            sub[b.name].Pts - sub[a.name].Pts ||
            sub[b.name].GD - sub[a.name].GD ||
            sub[b.name].GF - sub[a.name].GF ||
            b.conduct - a.conduct ||
            byLots(a.name, b.name),
        ),
      )
    } else {
      out.push(...cluster)
    }
    i = j
  }
  return out
}

export function rankGroup(group, matches) {
  const rows = Object.values(baseStats(group, matches))
  // Criterion 1: points. Then break ties among teams level on points with the
  // FIFA 2023 order (overall goal difference BEFORE head-to-head).
  rows.sort((a, b) => b.Pts - a.Pts)

  const ordered = []
  let i = 0
  while (i < rows.length) {
    let j = i + 1
    while (j < rows.length && rows[j].Pts === rows[i].Pts) j++
    const tied = rows.slice(i, j)
    ordered.push(...(tied.length > 1 ? resolveLevelOnPoints(tied, group, matches) : tied))
    i = j
  }
  return ordered.map((r, idx) => ({ ...r, rank: idx + 1 }))
}

export function groupComplete(group, matches) {
  return (
    matches.filter((m) => m.stage === 'Group' && m.group === group && m.score).length >=
    GROUP_MATCH_COUNT
  )
}

// Full tournament qualification picture. Simpler than the Euro's: with no
// cross-group thirds race, every group is independent and its own completion is
// all that matters.
export function computeQualification(matches) {
  const groups = {}
  const completion = {}
  for (const g of GROUPS) {
    groups[g] = rankGroup(g, matches)
    completion[g] = groupComplete(g, matches)
  }
  const allComplete = GROUPS.every((g) => completion[g])
  return { groups, completion, allComplete }
}

// Per-row qualification status for the standings UI.
// 'in'  = advances (top two of the group)
// 'out' = eliminated
// null  = group still in progress, so nothing is settled by position alone.
export function rowStatus(row, group, qual) {
  if (!qual.completion[group]) return null // group still in progress
  return row.rank <= ADVANCING_PER_GROUP ? 'in' : 'out'
}
