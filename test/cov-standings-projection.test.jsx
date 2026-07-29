import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import Standings from '../src/components/Standings.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { computeClinch } from '../src/utils/clinch.js'
import { FINAL_GROUP_RESULTS } from './fixtures/final-group-results.js'

// Clicking a team name opens the per-team group modal, which renders that team's
// projected knockout matchup via Standings' `teamKnockout` — exercising the `dest`
// selector (won-group → proj.first, runner-up → proj.second, else by current rank
// → first/second/third). We click teams of each clinched status to cover every arm.
// Standings takes `clinch` as a prop (App supplies it); teamKnockout returns null
// without it, so the projection selector is only reachable when it's passed.
const renderWith = (matches) =>
  render(
    <FollowProvider>
      <Standings matches={matches} hideScores={false} clinch={computeClinch(matches)} />
    </FollowProvider>,
  )

const clickTeam = (container, name) => {
  const btn = [...container.querySelectorAll('.row-team-btn')].find(
    (b) => b.textContent.trim() === name,
  )
  expect(btn, `clickable team button for ${name}`).toBeTruthy()
  fireEvent.click(btn)
}

describe('Standings — projected-matchup dest selector', () => {
  it('covers the won-group and runner-up arms on a completed group stage', () => {
    const scores = Object.assign({}, ...Object.values(FINAL_GROUP_RESULTS).map((r) => r.scores))
    const complete = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(complete)
    const winner = Object.keys(clinch).find((n) => clinch[n] === 'won-group')
    const runnerUp = Object.keys(clinch).find((n) => clinch[n] === 'runner-up')
    expect(winner).toBeTruthy()
    expect(runnerUp).toBeTruthy()
    // There is no 'third' verdict to cover: Copa advances only the top two, so
    // the dest selector has no best-third arm.
    expect(Object.values(clinch)).not.toContain('third')

    const { container } = renderWith(complete)
    // Opening each team's modal runs teamKnockout → the dest selector.
    clickTeam(container, winner) // status 'won-group' → proj.first
    clickTeam(container, runnerUp) // status 'runner-up' → proj.second
  })

  it('covers the top-2 (order-open) rank-1 and rank-2 arms', () => {
    // Group A only: New Zealand and Switzerland each beat the other two and have
    // not yet met (nor have the bottom two), so both are guaranteed top-2 with
    // the order still open ('top2'). They are dead level on points, GD and goals,
    // so the drawing-of-lots stand-in puts New Zealand at rank 1 and Switzerland
    // at rank 2 — exactly the pair of arms this exercises.
    const scores = {
      1: [1, 0], // New Zealand beat Norway
      17: [1, 0], // New Zealand beat the Philippines
      3: [0, 1], // Philippines 0–1 Switzerland
      18: [1, 0], // Switzerland beat Norway
      // M33 (Switzerland v New Zealand) and M34 (Norway v Philippines) unplayed.
    }
    const fixture = MATCHES.map((m) => (scores[m.num] ? { ...m, score: scores[m.num] } : m))
    const clinch = computeClinch(fixture)
    expect(clinch['New Zealand']).toBe('top2')
    expect(clinch['Switzerland']).toBe('top2')

    const { container } = renderWith(fixture)
    clickTeam(container, 'New Zealand') // top2, current rank 1 → proj.first
    clickTeam(container, 'Switzerland') // top2, current rank 2 → proj.second
  })
})
