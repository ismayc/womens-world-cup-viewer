import { describe, it, expect } from 'vitest'
import { countIterations, countRemaining } from '../src/utils/outlookEnum.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { TEAMS } from '../src/data/teams.js'

const GROUPS = Object.keys(TEAMS)
const MAX_ITERS = 12_000_000
// OutlookView's own gate: it refuses to enumerate above this many open games.
const MAX_REMAINING = 14
// Each group of four has at most 12 distinct reachable (winner, runner-up)
// outcomes, so the cross-group cartesian tops out at 12^8 — about 430 million
// with eight groups, which is why the ceiling is no longer a safety argument.
const CEILING = 12 ** GROUPS.length

// Leave the last `openPerGroup` games of every group unplayed; fill the rest.
function withOpenTail(openPerGroup) {
  const open = new Set()
  for (const g of GROUPS) {
    const nums = MATCHES.filter((m) => m.stage === 'Group' && m.group === g)
      .map((m) => m.num)
      .sort((a, b) => a - b)
    for (const n of nums.slice(-openPerGroup)) open.add(n)
  }
  return MATCHES.map((m) =>
    m.stage === 'Group' && !open.has(m.num) ? { ...m, score: [1, 0] } : m,
  )
}

// Open exactly `total` games, taking whole groups' tails until the budget runs
// out — the shape a real board has as the final matchday approaches.
function withOpenCount(total) {
  const open = new Set()
  let left = total
  for (const g of GROUPS) {
    if (left <= 0) break
    const nums = MATCHES.filter((m) => m.stage === 'Group' && m.group === g)
      .map((m) => m.num)
      .sort((a, b) => a - b)
    const take = Math.min(2, left)
    for (const n of nums.slice(-take)) open.add(n)
    left -= take
  }
  return MATCHES.map((m) =>
    m.stage === 'Group' && !open.has(m.num) ? { ...m, score: [1, 0] } : m,
  )
}

describe('outlookEnum — the adaptive cap inside the UI gate', () => {
  it('never has to lower the cap for a board OutlookView would actually enumerate', () => {
    // This is the real guarantee. OutlookView bails above 14 open games, and at
    // that limit the distinct-outcome cartesian is ~330k — two orders of
    // magnitude inside MAX_ITERS — so chooseCaps returns on its first pass.
    const atGate = withOpenCount(MAX_REMAINING)
    expect(countRemaining(atGate)).toBe(MAX_REMAINING)
    const iters = countIterations(atGate)
    expect(iters).toBeLessThan(MAX_ITERS)
    expect(iters).toBeLessThan(1_000_000)
  })

  it('grows monotonically with the open games', () => {
    const counts = [1, 2, 3].map((n) => countIterations(withOpenTail(n)))
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
    for (const c of counts) expect(c).toBeLessThanOrEqual(CEILING)
  })

  it('DOES overflow MAX_ITERS on a wider board, so the cap fallback is live code', () => {
    // Eight groups is the structural difference from the Copa sibling, whose four
    // groups top out at 12^4 = 20,736 and therefore can never overflow. Three
    // open games per group here walks past MAX_ITERS, and lowering the cap does
    // not rescue it — margin combinations collapse into the same ~12 distinct
    // (winner, runner-up) pairs per group, so the count saturates. chooseCaps
    // exhausts its loop and returns the last attempt.
    //
    // That makes the fallback REACHABLE, which is why the source no longer
    // carries a v8-ignore there. If this ever flips back to "fits", the ignore
    // can return — but only with a comment saying why.
    const wide = withOpenTail(3)
    expect(countRemaining(wide)).toBe(3 * GROUPS.length)
    const iters = countIterations(wide)
    expect(iters).toBeGreaterThan(MAX_ITERS)
    expect(iters).toBeLessThanOrEqual(CEILING)
    // Well beyond what the UI would ever ask for.
    expect(countRemaining(wide)).toBeGreaterThan(MAX_REMAINING)
  })
})
