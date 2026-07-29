// Official FINAL group results and finishing orders for the 2023 FIFA Women's
// World Cup, frozen so the standings / tie-breaker engine can't silently drift
// from the real outcome — the results parallel of official-kickoffs.js.
//
// `scores` restates the committed result for each of a group's six matches, so a
// silent rewrite of src/data/matches.js fails here too. `order` is the official
// finishing order, taken from ESPN's published group standings (the `rank` stat
// on the season standings endpoint) rather than from our own rankGroup — which
// is the whole point: a fixture derived from the engine it guards proves
// nothing. The top two of each group went to the Round of 16 and 3rd/4th were
// eliminated; this format has no best-third race, so every position is settled
// inside its group.
//
// test/final-standings.test.js replays `scores` through rankGroup and asserts the
// finishing order matches `order` exactly — so a tie-breaker regression is caught
// against the real tournament rather than against a synthetic case.
//
// GROUP H IS THE ONE THAT MATTERS. Colombia and Morocco both finished on 6
// points, and MOROCCO WON THEIR HEAD-TO-HEAD (Match 48, Morocco 1–0 Colombia) —
// yet Colombia finished above them, on goal difference (+2 against −4). That is
// real-tournament proof that goal difference outranks head-to-head in this
// competition. If someone "corrects" qualification.js to compare head-to-head
// first, Group H flips, OFFICIAL_R16 stops matching, and this fixture says so.
// Group A carries the same tie-break more mildly (Norway +5 over New Zealand +0,
// both on 4 points).
//
// FIFA tie-breakers in effect: points → goal difference → goals scored →
// head-to-head (points, then GD, then goals among the tied teams) → fair play →
// drawing of lots.

export const FINAL_GROUP_RESULTS = {
  A: {
    scores: { 1: [1, 0], 3: [0, 2], 17: [0, 1], 18: [0, 0], 33: [0, 0], 34: [6, 0] },
    order: ['Switzerland', 'Norway', 'New Zealand', 'Philippines'],
  },
  B: {
    scores: { 2: [1, 0], 4: [0, 0], 19: [2, 1], 22: [2, 3], 35: [0, 4], 36: [0, 0] },
    order: ['Australia', 'Nigeria', 'Canada', 'Republic of Ireland'],
  },
  C: {
    scores: { 5: [3, 0], 6: [0, 5], 20: [5, 0], 21: [2, 0], 37: [4, 0], 38: [1, 3] },
    order: ['Japan', 'Spain', 'Zambia', 'Costa Rica'],
  },
  D: {
    scores: { 7: [1, 0], 8: [1, 0], 25: [1, 0], 26: [1, 0], 39: [1, 6], 40: [0, 2] },
    order: ['England', 'Denmark', 'China', 'Haiti'],
  },
  E: {
    scores: { 9: [3, 0], 10: [1, 0], 23: [1, 1], 24: [2, 0], 41: [0, 0], 42: [0, 7] },
    order: ['Netherlands', 'United States', 'Portugal', 'Vietnam'],
  },
  F: {
    scores: { 11: [0, 0], 13: [4, 0], 28: [2, 1], 29: [0, 1], 43: [3, 6], 44: [0, 0] },
    order: ['France', 'Jamaica', 'Brazil', 'Panama'],
  },
  G: {
    scores: { 12: [2, 1], 14: [1, 0], 27: [2, 2], 30: [5, 0], 45: [0, 2], 46: [3, 2] },
    order: ['Sweden', 'South Africa', 'Italy', 'Argentina'],
  },
  H: {
    scores: { 15: [6, 0], 16: [2, 0], 31: [1, 2], 32: [0, 1], 47: [1, 1], 48: [1, 0] },
    order: ['Colombia', 'Morocco', 'Germany', 'South Korea'],
  },
}

// The Round-of-16 line-up, taken from the committed schedule's own t1/t2 — which
// came from ESPN's SCOREBOARD structure, NOT from rankGroup and not from the
// standings endpoint the orders above come from. That makes it an INDEPENDENT
// anchor: `order` is what our engine must produce from `scores`, and if it were
// wrong the pairings it implies would not match these real ones.
// final-standings.test.js asserts exactly that, which is what keeps this fixture
// from being a restatement of the code it tests.
export const OFFICIAL_R16 = {
  49: ['Switzerland', 'Spain'], // Winner A v Runner-up C
  50: ['Japan', 'Norway'], // Winner C v Runner-up A
  51: ['Netherlands', 'South Africa'], // Winner E v Runner-up G
  52: ['Sweden', 'United States'], // Winner G v Runner-up E
  53: ['Australia', 'Denmark'], // Winner B v Runner-up D
  54: ['England', 'Nigeria'], // Winner D v Runner-up B
  55: ['France', 'Morocco'], // Winner F v Runner-up H
  56: ['Colombia', 'Jamaica'], // Winner H v Runner-up F
}
