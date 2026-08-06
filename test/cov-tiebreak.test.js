import { describe, it, expect } from 'vitest'
import { softTiebreaks } from '../src/utils/tiebreakNotes.js'
import { rankGroup } from '../src/utils/qualification.js'

// THIS edition's Group A, in roster order; build a full round-robin. The names
// have to be the real ones: the ranker seeds its rows from the committed group,
// so a fixture carrying another tournament's teams would rank a blank table and
// everything below would pass without a single result being read.
const A = ['New Zealand', 'Norway', 'Philippines', 'Switzerland']
const PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
function groupA(scores) {
  return PAIRS.map(([i, j], k) => ({
    num: 100 + k,
    stage: 'Group',
    group: 'A',
    t1: A[i],
    t2: A[j],
    score: scores[k],
  }))
}

describe('softTiebreaks — head-to-head separates a subset', () => {
  it('recurses on a head-to-head sub-cluster that is a strict subset of the tied set', () => {
    // New Zealand win everything (9 pts); the other three all finish level on 3
    // overall points. Inside that three-way tie the head-to-head mini-table
    // separates a strict subset (2 of the 3), so the marker recurses on the
    // subset rather than declaring the whole cluster soft-separated.
    const scores = [[1, 0], [1, 0], [1, 0], [1, 0], [0, 1], [2, 1]]
    const matches = groupA(scores)

    // The recursion resolves the whole cluster on hard criteria, so nobody is
    // left needing a fair-play or drawing-of-lots note.
    expect([...softTiebreaks('A', matches)]).toEqual([])
    // …and the order it produced is the one those criteria dictate.
    expect(rankGroup('A', matches).map((r) => `${r.name} ${r.Pts}`)).toEqual([
      'New Zealand 9',
      'Philippines 3',
      'Switzerland 3',
      'Norway 3',
    ])
  })
})
