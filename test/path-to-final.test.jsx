import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { knockoutTeams, pathToFinal, matchesByNum } from '../src/utils/bracket.js'
import { PathProvider as PP, usePath } from '../src/context/path.jsx'
import Bracket from '../src/components/Bracket.jsx'
import PathPicker from '../src/components/PathPicker.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { PathProvider } from '../src/context/path.jsx'
import { DetailContext } from '../src/context/detail.js'
import { MATCHES as PLAYED } from '../src/data/matches.js'
import { unscored } from './helpers/tournament.js'
// This edition is finished, so the committed schedule ships with every result
// in it. These tests were written against a schedule that had none, so they
// work from a blank board; `PLAYED` is there when the real results are wanted.
const MATCHES = unscored(PLAYED)

Element.prototype.scrollIntoView = vi.fn()

// A blank board with two filled round-of-16 ties, optionally carrying results
// down Spain's winner chain 49→57→61→64. This knockout starts at the round of
// 16, so a route is FOUR matches — one more than the Copa sibling's, and the
// same depth as the Euro's.
//
// 49 and 51 are the two ties that feed quarter-final 57 (not 49 and 50 — the
// halves of the draw interleave), so filling both is what lets 57 expand.
function withPath(overrides = {}) {
  return MATCHES.map((m) => (overrides[m.num] ? { ...m, ...overrides[m.num] } : m))
}
const R16_TEAMS = {
  49: { t1: 'Switzerland', t2: 'Spain' },
  51: { t1: 'Netherlands', t2: 'South Africa' },
}

const renderWith = (ui, { pathTeam } = {}) => {
  if (pathTeam) localStorage.setItem('wwc:pathTeam', pathTeam)
  return render(
    <FollowProvider>
      <PathProvider>
        <DetailContext.Provider value={vi.fn()}>{ui}</DetailContext.Provider>
      </PathProvider>
    </FollowProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('pathToFinal + knockoutTeams (util)', () => {
  it('lists the real teams in the round of 16, sorted', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    expect(knockoutTeams(byNum)).toEqual(['Netherlands', 'South Africa', 'Spain', 'Switzerland'])
  })

  it('returns null for a team not (yet) in the round of 16', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    expect(pathToFinal('Brazil', byNum)).toBeNull()
    expect(pathToFinal(null, byNum)).toBeNull()
  })

  it('traces the full winner route from the round of 16 to the Final', () => {
    const byNum = matchesByNum(withPath(R16_TEAMS))
    const p = pathToFinal('Spain', byNum)
    expect(p.nums).toEqual([49, 57, 61, 64])
    expect(p.active).toEqual([49, 57, 61, 64]) // alive → whole route lit
    expect(p.here).toEqual([49]) // only the round-of-16 tie has Spain so far
    expect(p.exitNum).toBeNull()
    // The third-place play-off is NOT on anyone's route to the Final — it hangs
    // off the bracket, so a loser's trace must not pick it up.
    expect(p.nums).not.toContain(63)
  })

  it('stops the active stretch at the match where the team was eliminated', () => {
    // Spain beat Switzerland in the round of 16 (the real 5–1).
    const byNum = matchesByNum(withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] } }))
    const p = pathToFinal('Switzerland', byNum)
    expect(p.exitNum).toBe(49)
    expect(p.active).toEqual([49]) // nothing downstream is lit once out
  })

  it('breaks a level tie on penalties to decide the exit', () => {
    // The real shape here: every level knockout tie played extra time FIRST, so a
    // shootout always carries `aet` too. (The Copa sibling is the opposite — its
    // shootouts came straight after 90 minutes.) Match 52 is the real example:
    // Sweden knocked the United States out 5–4 on penalties after 0–0 aet.
    const byNum = matchesByNum(
      withPath({ 52: { t1: 'Sweden', t2: 'United States', score: [0, 0], aet: true, pens: [5, 4] } }),
    )
    expect(pathToFinal('United States', byNum).exitNum).toBe(52) // lost the shootout
    expect(pathToFinal('Sweden', byNum).exitNum).toBeNull() // advanced
  })

  it('keeps the team alive through a win and follows it into the next round', () => {
    const byNum = matchesByNum(
      withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] }, 57: { t1: 'Spain' } }),
    )
    const p = pathToFinal('Spain', byNum)
    expect(p.here).toEqual([49, 57])
    expect(p.exitNum).toBeNull()
    expect(p.active).toEqual([49, 57, 61, 64])
  })

  it('treats a drawn tie with no shootout as unsettled — neither out nor through', () => {
    const byNum = matchesByNum(withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 1] } }))
    // No winner decided yet → the team is neither eliminated nor advanced.
    expect(pathToFinal('Switzerland', byNum).exitNum).toBeNull()
    expect(pathToFinal('Spain', byNum).exitNum).toBeNull()
  })
})

describe('PathProvider context', () => {
  const wrapper = ({ children }) => <PP>{children}</PP>

  it('persists the selection and clears it from localStorage', () => {
    const { result } = renderHook(() => usePath(), { wrapper })
    act(() => result.current.setPathTeam('Spain'))
    expect(localStorage.getItem('wwc:pathTeam')).toBe('Spain')
    act(() => result.current.setPathTeam(null))
    expect(localStorage.getItem('wwc:pathTeam')).toBeNull()
  })

  it('falls back to null when reading localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(result.current.pathTeam).toBeNull()
    spy.mockRestore()
  })

  it('swallows localStorage write errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => usePath(), { wrapper })
    expect(() => act(() => result.current.setPathTeam('Sweden'))).not.toThrow()
    spy.mockRestore()
  })

  it('returns inert defaults without a provider', () => {
    const { result } = renderHook(() => usePath())
    expect(result.current.pathTeam).toBeNull()
    expect(() => result.current.setPathTeam('x')).not.toThrow()
  })
})

describe('PathPicker', () => {
  const fullRun = {
    49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] },
    57: { t1: 'Spain', score: [2, 1] },
    61: { t1: 'Spain', score: [2, 1] },
    64: { t1: 'Spain', score: [1, 0] },
  }

  it('renders nothing until the round of 16 has real teams', () => {
    const { container } = renderWith(<PathPicker byNum={matchesByNum(MATCHES)} />)
    expect(container.querySelector('.path-picker')).toBeNull()
  })

  it('selecting a team from the dropdown sets the path and shows a status', () => {
    renderWith(<PathPicker byNum={matchesByNum(withPath(R16_TEAMS))} />)
    fireEvent.change(screen.getByLabelText(/Path to the Final/), { target: { value: 'Spain' } })
    expect(screen.getByText(/Up next/)).toBeInTheDocument()
    // Clearing removes the status.
    fireEvent.click(screen.getByRole('button', { name: /Clear/ }))
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument()
  })

  it('summarizes "through to the next round" after winning its deepest match', () => {
    // Won the round-of-16 tie (49); the quarter-final (57) doesn't list Spain
    // yet → "through to the Quarter-final".
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] } }))} />,
      { pathTeam: 'Spain' },
    )
    expect(screen.getByText(/Through to the Quarter-final/)).toBeInTheDocument()
  })

  it('summarizes elimination', () => {
    renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] } }))} />,
      { pathTeam: 'Switzerland' },
    )
    expect(screen.getByText(/Out — lost in the Round of 16/i)).toBeInTheDocument()
  })

  it('summarizes a live match and the champion', () => {
    // Live in the quarter-final.
    const { unmount } = renderWith(
      <PathPicker byNum={matchesByNum(withPath({ 49: { t1: 'Switzerland', t2: 'Spain', live: true } }))} />,
      { pathTeam: 'Spain' },
    )
    expect(screen.getByText(/Playing now/)).toBeInTheDocument()
    unmount()
    // Won the Final → champions.
    renderWith(<PathPicker byNum={matchesByNum(withPath(fullRun))} />, { pathTeam: 'Spain' })
    expect(screen.getByText(/Champions/)).toBeInTheDocument()
  })

  it('offers a quick chip for a followed knockout team', () => {
    localStorage.setItem('wwc:followed', JSON.stringify(['Spain']))
    renderWith(<PathPicker byNum={matchesByNum(withPath(R16_TEAMS))} />)
    const chip = screen.getByRole('button', { name: /Spain/ })
    fireEvent.click(chip)
    expect(chip.className).toMatch(/active/)
    fireEvent.click(chip) // toggles back off
    expect(chip.className).not.toMatch(/active/)
  })
})

describe('Bracket path highlight', () => {
  it('marks the route boxes on-path and dims the rest', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(R16_TEAMS)} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Spain' },
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeTruthy()
    for (const n of [49, 57, 61, 64]) {
      expect(document.getElementById(`bx-m${n}`).classList.contains('on-path')).toBe(true)
    }
    expect(document.getElementById('bx-m59').classList.contains('on-path')).toBe(false)
    // The third-place play-off is off the route to the Final, so it stays dim.
    expect(document.getElementById('bx-m63').classList.contains('on-path')).toBe(false)
    // The traced team's name is emphasized inside its box.
    expect(document.querySelector('#bx-m49 .bx-side.on-path-team')).toBeTruthy()
  })

  it('flags the elimination box with the exit style and lights nothing beyond it', () => {
    renderWith(
      <Bracket matches={withPath({ 49: { t1: 'Switzerland', t2: 'Spain', score: [1, 5] } })} tz="America/New_York" hideScores={false} />,
      { pathTeam: 'Switzerland' },
    )
    const exit = document.getElementById('bx-m49')
    expect(exit.classList.contains('on-path')).toBe(true)
    expect(exit.classList.contains('path-exit')).toBe(true)
    expect(document.getElementById('bx-m57').classList.contains('on-path')).toBe(false)
  })

  it('shows no highlight when no team is selected', () => {
    const { container } = renderWith(
      <Bracket matches={withPath(R16_TEAMS)} tz="America/New_York" hideScores={false} />,
    )
    expect(container.querySelector('.bracket-wrap.has-path')).toBeNull()
    expect(document.querySelector('.bx-match.on-path')).toBeNull()
  })
})
