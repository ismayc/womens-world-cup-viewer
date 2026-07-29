import { describe, it, expect } from 'vitest'
import { softTiebreaks, TIEBREAK_LABEL } from '../src/utils/tiebreakNotes.js'
import { rankGroup } from '../src/utils/qualification.js'

// Group A teams, in ALPHABETICAL order — which is also the order the drawing-of-
// lots stand-in produces, so the expectations below stay readable. Build a full
// round-robin so we can force exact ties down to the soft criteria. The names
// must be the REAL group members: rankGroup reads the group from the data, so a
// fixture built with a sibling tournament's teams would rank an empty table and
// every assertion below would pass vacuously — which is exactly what the first
// test guards against.
const A = ['New Zealand', 'Norway', 'Philippines', 'Switzerland']
const PAIRS = [
  [0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3],
]
function groupA(scores, cards = {}) {
  return PAIRS.map(([i, j], k) => ({
    num: 100 + k,
    stage: 'Group',
    group: 'A',
    t1: A[i],
    t2: A[j],
    score: scores[k],
    cards: cards[k],
  }))
}

const allDrawn = groupA(PAIRS.map(() => [0, 0]))

describe('softTiebreaks', () => {
  it('is built on the real Group A, so the assertions below are not vacuous', () => {
    // A fixture carrying a sibling tournament's team names would rank an empty
    // table and every "no note" assertion would pass without testing anything.
    expect(rankGroup('A', allDrawn).map((r) => r.name).sort()).toEqual([...A].sort())
  })

  it('flags placings separated only by the drawing of lots', () => {
    // Every game 0-0: all four level on points, head-to-head, GD and goals, and
    // there are no cards — so nothing but FIFA's last criterion is left. (The
    // Euro sibling would reach for the qualifiers ranking here, and the 2026
    // men's edition for the FIFA ranking; in 2023 it really is a draw of lots.)
    const notes = softTiebreaks('A', allDrawn)
    expect(notes.size).toBe(4)
    for (const name of A) expect(notes.get(name).reason).toBe('lots')
  })

  it('flags a placing separated by fair play points', () => {
    // All 0-0, but Switzerland pick up a red card → their fair play score is
    // worse, so the pair straddling them is separated by cards, not by lots.
    const cards = { 2: { t2: [{ color: 'red' }] } } // New Zealand v Switzerland, Swiss carded
    const notes = softTiebreaks('A', groupA(PAIRS.map(() => [0, 0]), cards))
    expect(notes.get('Switzerland').reason).toBe('conduct')
    expect(notes.get('Switzerland').vs).toBe('Philippines')
    expect(notes.get('Philippines').reason).toBe('conduct')
    // The pair above them is still untouched by the card, so it stays on lots.
    expect(notes.get('New Zealand').reason).toBe('lots')
  })

  it('adds no note when placings are separated by points or goal difference', () => {
    // New Zealand win all, Switzerland lose all, the middle two split — clear on
    // points and goal difference, so nothing is down to a soft tie-breaker.
    const scores = [
      [1, 0], // NZL v NOR
      [1, 0], // NZL v PHI
      [3, 0], // NZL v SUI
      [1, 0], // NOR v PHI
      [2, 0], // NOR v SUI
      [2, 0], // PHI v SUI
    ]
    const notes = softTiebreaks('A', groupA(scores))
    expect(notes.size).toBe(0)
  })

  it('does not flag teams that are clear on head-to-head', () => {
    // Both pairs are dead level on points, GD and goals, but each was settled by
    // the game between them — so it is head-to-head, not a soft tie-breaker.
    const scores = [
      [1, 0], // NZL v NOR -> New Zealand win the head-to-head
      [0, 1], // NZL v PHI
      [1, 0], // NZL v SUI
      [1, 0], // NOR v PHI
      [1, 0], // NOR v SUI
      [0, 1], // PHI v SUI -> Switzerland win the head-to-head
    ]
    const table = rankGroup('A', groupA(scores))
    // Prove the tie is real before asserting nothing flagged it.
    expect([table[0].Pts, table[1].Pts]).toEqual([6, 6])
    expect([table[0].GD, table[1].GD]).toEqual([1, 1])
    expect([table[0].GF, table[1].GF]).toEqual([2, 2])
    expect(softTiebreaks('A', groupA(scores)).size).toBe(0)
  })
})

describe('TIEBREAK_LABEL', () => {
  it('has a plain-English label for each soft reason, and no more', () => {
    expect(Object.keys(TIEBREAK_LABEL).sort()).toEqual(['conduct', 'lots'])
    expect(TIEBREAK_LABEL.conduct).toMatch(/fair play/)
    expect(TIEBREAK_LABEL.lots).toMatch(/drawing of lots/)
  })
})
