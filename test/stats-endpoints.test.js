import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEADERS_SOURCE } from '../src/services/espnStats.js'
import { SUMMARY_SOURCE } from '../src/services/espnMatchStats.js'
import { LIVE_SOURCE } from '../src/services/espn.js'

// Every ESPN URL in the app must address THIS competition.
//
// Why this file exists: the player-stats layer is scaffolded from
// copa-america-viewer, and its storage keys were rebranded to `wwc:` while its
// URLs were not. `espnStats.js` kept asking for
// `leagues/conmebol.america/seasons/2024` — a season-scoped endpoint with no
// event id, so it did not fail. It answered 200 with the MEN'S Copa América 2024
// leaders (Lautaro Martínez topping it on 5 goals), whose assists and minutes
// were then name-joined against Women's World Cup scorers. Nothing matched, the
// Boot table quietly dropped its extra columns, and because this is the one
// module the suite does not otherwise exercise, everything stayed green.
//
// A wrong-competition URL is therefore invisible in two ways at once: it returns
// a valid document, and the code that consumes it degrades silently by design.
// These assertions are the only thing standing between a re-scaffold and that
// bug, so keep them literal.

const WWC_SLUG = 'fifa.wwc'
const EDITION_SEASON = '2023'
// Slugs belonging to the sibling viewers. Any of these in a URL here means a
// rebrand was left half-done.
const SIBLING_SLUGS = [
  'conmebol.america', // copa-america-viewer
  'uefa.euro', // football-euros-viewer
  'fifa.world', // world-cup-viewer (men's)
  'eng.1', // premier-league
]

describe('ESPN endpoints address this competition', () => {
  const sources = {
    'LEADERS_SOURCE (espnStats.js)': LEADERS_SOURCE,
    'SUMMARY_SOURCE (espnMatchStats.js)': SUMMARY_SOURCE,
    'LIVE_SOURCE (espn.js)': LIVE_SOURCE,
  }

  for (const [label, src] of Object.entries(sources)) {
    it(`${label} points at ${WWC_SLUG}`, () => {
      expect(src.url).toContain(WWC_SLUG)
    })

    it(`${label} carries no sibling league slug`, () => {
      for (const slug of SIBLING_SLUGS) {
        expect(src.url, `${label} still references ${slug}`).not.toContain(slug)
      }
    })
  }

  it('the season-scoped leaders URL asks for this edition, not a sibling season', () => {
    // The failure mode this catches is subtler than a bad slug: fifa.wwc with the
    // wrong season is a 200 for a DIFFERENT women's World Cup.
    expect(LEADERS_SOURCE.url).toContain(`/seasons/${EDITION_SEASON}/`)
    expect(LEADERS_SOURCE.url).not.toMatch(/\/seasons\/20(19|24|26)\//)
  })

  // The two exported constants above are not the whole story — a URL built inline
  // somewhere in src/services would slip past them. Sweep the directory too.
  it('no sibling league slug appears anywhere in src/services', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'services')
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
    expect(files.length).toBeGreaterThan(0)
    const offenders = []
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8')
      // Only flag real URL paths, so prose like "unlike the Copa América sibling"
      // in a comment stays allowed.
      for (const slug of SIBLING_SLUGS) {
        if (body.includes(`/${slug}/`)) offenders.push(`${f} -> ${slug}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
