import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FLAG_BY_TEAM } from '../src/data/teams.js'
import { normEspn, ESPN_ALIASES } from '../src/services/espn.js'
import { normalizeTeam, isRealTeam, pairKey } from '../src/services/teamNames.js'

// An external feed spelling that no normalizer maps to our canonical name fails
// SILENTLY: the lookup returns a non-team and the match is quietly dropped from
// the live overlay. These tests pin every REAL captured feed spelling to a real
// team, so a drift in the feed is a red test rather than a missing score.
//
// This is not hypothetical. The table inherited from the sibling Euro/World Cup
// viewers mapped ESPN's "United States" to "USA" — correct there, and wrong here,
// where "United States" IS the canonical name. It rewrote every USA match to a
// non-team. The dead-entry test at the bottom is what makes that class of bug
// loud instead of silent.
//
// ONE feed, not two. The sibling viewers cross-check ESPN against OpenFootball's
// cup.txt, but OpenFootball publishes the men's competitions only — there is no
// women's repo in any format — so ESPN is this app's single source and there is
// no second spelling set to reconcile. See services/teamNames.js.
//
// Fixture is a capture of the whole 2023 tournament:
//   site.api.espn.com/apis/site/v2/sports/soccer/fifa.wwc/scoreboard
//     ?dates=20230720-20230820&limit=100 → competitors[].team.displayName

const here = dirname(fileURLToPath(import.meta.url))
const espnNames = JSON.parse(readFileSync(resolve(here, 'fixtures/espn-team-names.json'), 'utf8'))

// Canonical team names = the 32 sides that played.
const canonical = new Set(Object.keys(FLAG_BY_TEAM))

describe('team name resolution from real feed spellings', () => {
  it('every ESPN spelling resolves to a real team', () => {
    const bad = espnNames.filter((n) => !canonical.has(normEspn(n))).map((n) => `${n} → ${normEspn(n)}`)
    expect(bad, `ESPN spellings not resolving to a known team: ${bad.join(', ')}`).toEqual([])
  })

  it('the feed covers all 32 teams (none left without a known spelling)', () => {
    // A team missing here is a spelling we have never seen — the exact gap that
    // silently drops its live score.
    const covered = new Set(espnNames.map(normEspn))
    const missing = [...canonical].filter((t) => !covered.has(t))
    expect(missing, `teams with no captured ESPN spelling: ${missing.join(', ')}`).toEqual([])
    expect(espnNames).toHaveLength(32)
  })

  it('regression: "United States" survives the feed unchanged', () => {
    // The bug this file exists for. The feed writes it exactly as we do, so any
    // rewriting of it is wrong by definition.
    expect(normEspn('United States')).toBe('United States')
    expect(normalizeTeam('United States')).toBe('United States')
    expect(canonical.has('United States')).toBe(true)
    expect(espnNames).toContain('United States')
  })

  it('the feed needs no renaming — it already uses the canonical forms', () => {
    expect(espnNames.every((n) => canonical.has(n))).toBe(true)
  })

  it('FIFA’s own divergent spellings never reach runtime', () => {
    // FIFA writes "China PR", "Korea Republic" and "USA"; those are resolved at
    // BUILD time in scripts/fetch-tournament.mjs, so neither the feed capture nor
    // the canonical set should contain them. If one ever appears here, the build
    // step stopped doing its job and the runtime table has to grow.
    for (const fifaForm of ['China PR', 'Korea Republic', 'USA']) {
      expect(espnNames, `${fifaForm} reached the ESPN capture`).not.toContain(fifaForm)
      expect(canonical.has(fifaForm), `${fifaForm} is canonical`).toBe(false)
    }
    expect(canonical.has('China')).toBe(true)
    expect(canonical.has('South Korea')).toBe(true)
  })
})

describe('the alias table carries no dead entries', () => {
  // The risk is not a gap but the opposite: an inherited entry for a team that is
  // not in this tournament, or for a name this feed never sends, which reads as
  // coverage while mapping nothing — or, worse, mangles a name that was already
  // right. Any entry must earn its place by appearing in the capture.
  it('every ESPN alias key appears in the captured feed spellings', () => {
    const unused = Object.keys(ESPN_ALIASES).filter((k) => !espnNames.includes(k))
    expect(unused, `alias keys never seen in the feed: ${unused.join(', ')}`).toEqual([])
  })

  it('every ESPN alias target is a canonical team name', () => {
    for (const target of Object.values(ESPN_ALIASES)) {
      expect(canonical.has(normalizeTeam(target)), `alias target "${target}" is not a team`).toBe(true)
    }
  })
})

describe('the shared name helpers', () => {
  it('normalizeTeam passes an empty name straight through', () => {
    expect(normalizeTeam('')).toBe('')
    expect(normalizeTeam(undefined)).toBe(undefined)
  })

  it('isRealTeam separates the 32 sides from bracket placeholders', () => {
    expect(isRealTeam('Spain')).toBe(true)
    expect(isRealTeam('Winner Group A')).toBe(false)
    expect(isRealTeam('2A')).toBe(false)
    expect(isRealTeam('')).toBe(false)
  })

  it('pairKey is order-independent, so either feed ordering matches', () => {
    expect(pairKey('Spain', 'England')).toBe(pairKey('England', 'Spain'))
    expect(pairKey('Spain', 'England')).not.toBe(pairKey('Spain', 'Sweden'))
  })
})
