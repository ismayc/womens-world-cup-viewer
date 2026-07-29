import { describe, it, expect } from 'vitest'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)
import { projectKnockout } from '../src/utils/asItStands.js'

// Regression: once a group is clinched, the live feed resolves its round-of-16
// slot label ("Winner Group A") to the real team ("Switzerland"). projectKnockout
// must read the slot structure from the STATIC schedule by match number, or it
// loses that winner's 1st projection (it came back null).
describe('projectKnockout — resolved winner slot labels', () => {
  it('still projects every group when round-of-16 winner slots are resolved to real teams', () => {
    // Resolve the winner side of some round-of-16 ties the way the live feed would
    // once those groups are decided.
    const resolved = MATCHES.map((m) => {
      if (m.num === 49) return { ...m, t1: 'Switzerland' } // was "Winner Group A"
      if (m.num === 51) return { ...m, t1: 'Netherlands' } // was "Winner Group E"
      if (m.num === 55) return { ...m, t1: 'France' } // was "Winner Group F"
      return m
    })
    const { perGroup } = projectKnockout(resolved)

    // No group's projections are lost…
    for (const g of Object.keys(perGroup)) {
      expect(perGroup[g].first, `group ${g} first`).toBeTruthy()
      expect(perGroup[g].second, `group ${g} second`).toBeTruthy()
    }
    // …and every winner slot still points at its round-of-16 tie, resolved or not.
    expect(perGroup.A.first.matchNum).toBe(49)
    expect(perGroup.B.first.matchNum).toBe(53) // never resolved — the control
    expect(perGroup.C.first.matchNum).toBe(50)
    expect(perGroup.D.first.matchNum).toBe(54)
    expect(perGroup.E.first.matchNum).toBe(51)
    expect(perGroup.F.first.matchNum).toBe(55)
    expect(perGroup.G.first.matchNum).toBe(52)
    expect(perGroup.H.first.matchNum).toBe(56)
    // The runner-up slots are the crossed pairings, and survive too: a group's
    // winner and runner-up go to two DIFFERENT ties (A→49 and A→50), and each
    // pairs with the group two letters along.
    expect(perGroup.A.second.matchNum).toBe(50)
    expect(perGroup.C.second.matchNum).toBe(49)
    expect(perGroup.B.second.matchNum).toBe(54)
    expect(perGroup.D.second.matchNum).toBe(53)
    expect(perGroup.E.second.matchNum).toBe(52)
    expect(perGroup.G.second.matchNum).toBe(51)
    expect(perGroup.F.second.matchNum).toBe(56)
    expect(perGroup.H.second.matchNum).toBe(55)
  })
})
