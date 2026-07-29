import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { enumerateOutlook, countRemaining, countIterations, ENTRY_SLOT_LABELS } from '../src/utils/outlookEnum.js'
import { GROUP_STAGE_MD3 } from './fixtures/group-stage-md3.js'

// Snapshot has Groups A, B and D-H done and Group C on its final matchday, so
// two games remain (Matches 37 and 38). Small and fast, while still enumerating
// real goal differences into the Round-of-16 slots.
const reduced = MATCHES.map((m) =>
  m.stage === 'Group' && GROUP_STAGE_MD3[m.num] ? { ...m, score: GROUP_STAGE_MD3[m.num] } : m,
)

// Fixed margin cap so the weighted space is deterministic: Group C has two games
// left, so the space is (2·CAP+1)^2 equally-weighted margin combinations.
const CAP = 5
const SPACE = (2 * CAP + 1) ** 2 // 11^2 = 121

describe('outlook enumeration (exact, goal-difference)', () => {
  it('reports the remaining-games count', () => {
    expect(countRemaining(reduced)).toBe(2) // Group C's final matchday
    expect(countIterations(reduced)).toBeGreaterThan(0)
  })

  it('enumerates the full weighted margin space; every slot sums to the total', () => {
    const { total, cap, perMatch } = enumerateOutlook(reduced, null, CAP)
    expect(cap).toBe(CAP)
    expect(total).toBe(SPACE)
    for (const num of Object.keys(ENTRY_SLOT_LABELS)) {
      for (const side of perMatch[num]) {
        const sum = side.candidates.reduce((s, c) => s + c.count, 0)
        expect(sum).toBe(total) // a fully-resolvable bracket fills every slot
      }
    }
  })

  it('locks a slot fed by a completed group (Winner Group A → Match 49)', () => {
    const { perMatch } = enumerateOutlook(reduced, null, CAP)
    // Match 49 is Winner Group A v Runner-up Group C. Group A is complete in the
    // snapshot, so its winner fills that side in 100% of outcomes regardless of
    // Group C's remaining margins…
    expect(perMatch[49][0].locked).toBeTruthy()
    // …while the other side is Group C's runner-up, still open — Spain and Japan
    // have both qualified but meet in Match 37 to decide the order.
    expect(perMatch[49][1].locked).toBeFalsy()
  })

  it('gives exact rational shares and reports progress to completion', () => {
    let lastDone = 0
    let lastTotal = 0
    const { perMatch, total } = enumerateOutlook(
      reduced,
      (done, t) => {
        lastDone = done
        lastTotal = t
      },
      CAP,
    )
    expect(lastDone).toBe(lastTotal) // final progress callback fires at 100%
    // Every candidate share is an exact count/total fraction.
    for (const side of perMatch[50]) {
      for (const c of side.candidates) {
        expect(Number.isInteger(c.count)).toBe(true)
        expect(c.pct).toBeCloseTo(c.count / total, 12)
      }
    }
  })
})
