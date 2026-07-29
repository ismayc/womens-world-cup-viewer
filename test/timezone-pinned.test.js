import { describe, it, expect } from 'vitest'
import { MATCHES } from '../src/data/matches.js'
import { dayKey } from '../src/utils/time.js'

// Guard for the whole suite's determinism.
//
// THIS EDITION HAS NO SINGLE TOURNAMENT TIMEZONE. The 10 host stadiums span four
// southern-winter offsets — +08:00 (Perth), +09:30 (Adelaide), +10:00 (Sydney,
// Melbourne, Brisbane) and +12:00 (New Zealand) — and every match is stored
// against its OWN venue's offset. So "the tournament timezone" is a choice, not
// a given, and the choice was measured rather than assumed:
//
//   Australia/Sydney   0 of 64 matches change calendar day   <- pinned
//   Australia/Perth    0
//   UTC                0
//   Pacific/Auckland   3   (Perth evening kickoffs roll forward a day)
//   America/New_York   7   (afternoon kickoffs roll back a day)
//
// Sydney is the +10:00 venue majority and the only zone that is both a real host
// zone and day-stable across all four offsets. Note UTC happens to be day-stable
// here too — unlike the sibling viewers, where UTC is exactly what breaks. That
// makes the pin easy to remove without noticing on a UTC CI runner, which is
// precisely why this file asserts it.
describe('the suite runs in a pinned timezone', () => {
  it('is fixed to Australia/Sydney, whatever the runner is set to', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Australia/Sydney')
  })

  it('proves the pin matters: an afternoon kickoff shifts a day on a US runner', () => {
    // Nigeria v Canada kicks off 12:30 on 21 July in Melbourne (+10:00), which
    // is still 20 July in New York — a plausible unpinned local-dev runner.
    const m = MATCHES.find((x) => x.num === 4)
    expect(dayKey(m.ko, 'Australia/Sydney')).toBe('2023-07-21')
    expect(dayKey(m.ko, 'America/New_York')).toBe('2023-07-20')
  })

  it('proves the pin matters across host zones: Perth shifts a day in Auckland', () => {
    // Denmark v China kicks off 20:00 on 22 July in Perth (+08:00) — already
    // 23 July in New Zealand, the tournament's other end.
    const m = MATCHES.find((x) => x.num === 8)
    expect(dayKey(m.ko, 'Australia/Sydney')).toBe('2023-07-22')
    expect(dayKey(m.ko, 'Pacific/Auckland')).toBe('2023-07-23')
  })

  it('every match sits on its own venue-local calendar day under the pin', () => {
    // The property the pin buys us: a day heading in the UI always matches the
    // date printed on the ticket. If this fails, the pin is wrong for the data.
    const off = MATCHES.filter((m) => dayKey(m.ko, 'Australia/Sydney') !== String(m.ko).slice(0, 10))
    expect(off.map((m) => m.num)).toEqual([])
  })
})
