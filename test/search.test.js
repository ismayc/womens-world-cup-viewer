import { describe, it, expect } from 'vitest'
import { parseQuery, matchesSearch } from '../src/utils/search.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { VENUES } from '../src/data/venues.js'
import { SEARCH_EXAMPLES } from '../src/components/Filters.jsx'

const count = (q) => {
  const p = parseQuery(q)
  return MATCHES.filter((m) => matchesSearch(m, VENUES[m.venue], p)).length
}

describe('parseQuery', () => {
  it('treats bare text as free text', () => {
    expect(parseQuery('Argentina')).toEqual({ free: 'Argentina', tokens: [] })
  })

  it('parses a single scoped token', () => {
    expect(parseQuery('team: Argentina')).toEqual({ free: '', tokens: [{ field: 'team', value: 'Argentina' }] })
  })

  it('parses multiple tokens, with or without spaces after the colon', () => {
    expect(parseQuery('team:Argentina city:Hamilton')).toEqual({
      free: '',
      tokens: [
        { field: 'team', value: 'Argentina' },
        { field: 'city', value: 'Hamilton' },
      ],
    })
  })

  it('maps field aliases (venue -> stadium, host -> country)', () => {
    expect(parseQuery('venue: Eden Park').tokens[0].field).toBe('stadium')
    expect(parseQuery('host: Australia').tokens[0].field).toBe('country')
  })
})

describe('matchesSearch counts', () => {
  it('team: Argentina -> 3 group matches', () => {
    // The knockout slots are still placeholders on a blank board, so a team's
    // hits are exactly its three group games.
    expect(count('team: Argentina')).toBe(3)
  })
  it('city: Sydney -> 11 (two different stadiums, both in Sydney)', () => {
    // Stadium Australia and Sydney Football Stadium are both in Sydney — a
    // genuine collision this tournament's venue list has to survive.
    expect(count('city: Sydney')).toBe(11)
  })
  it('country: either host -> all 64 (a TWO-host tournament)', () => {
    // The venue table stores the combined host string "Australia & New Zealand"
    // on every venue, so a country filter for either name matches the whole
    // tournament. That is the honest answer for a co-hosted edition — unlike the
    // single-host Copa sibling, "country" cannot narrow anything here.
    expect(count('country: Australia')).toBe(64)
    expect(count('country: New Zealand')).toBe(64)
  })
  it('group: C -> 6', () => {
    expect(count('group: C')).toBe(6)
  })
  it('stage: Final -> 1', () => {
    expect(count('stage: Final')).toBe(1)
  })
  it('stadium: Eden -> 9 (Eden Park’s share of the schedule)', () => {
    expect(count('stadium: Eden')).toBe(9)
  })
  it('stage: 3rd -> 1 (the play-off this edition still plays)', () => {
    expect(count('stage: 3rd')).toBe(1)
  })
  it('combines tokens: team: Canada stage: group -> 3', () => {
    expect(count('team: Canada stage: group')).toBe(3)
  })
  it('stage synonyms work (semi -> SF -> 2)', () => {
    expect(count('stage: semi')).toBe(2)
  })
  it('no-space form team:Argentina city:Hamilton -> 1', () => {
    expect(count('team:Argentina city:Hamilton')).toBe(1)
  })

  // The scaffold shipped Copa's chips ("team: Mexico", "city: Arlington"), which
  // are one-click buttons that emptied the schedule: Mexico never played this
  // edition and no venue is in Arlington. Assert every chip against the REAL
  // committed data, so a future re-scaffold cannot leave a dead button behind.
  // Teeth-checked: putting "team: Mexico" back reddens this.
  it('every one-click search example returns matches in this edition', () => {
    expect(SEARCH_EXAMPLES.length).toBeGreaterThan(0)
    for (const ex of SEARCH_EXAMPLES) {
      const p = parseQuery(ex)
      const hits = PLAYED.filter((m) => matchesSearch(m, VENUES[m.venue], p)).length
      expect(hits, `search example "${ex}" matched nothing`).toBeGreaterThan(0)
    }
  })
})
