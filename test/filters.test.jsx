import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import Filters, { SEARCH_EXAMPLES } from '../src/components/Filters.jsx'

const DEFAULTS = {
  search: '',
  stages: [],
  group: 'all',
  team: 'all',
  country: 'all',
  region: 'all',
  venue: 'all',
  timeframe: 'all',
  feed: 'both',
}

// Stateful harness so setFilters updater functions actually flow through.
function Harness({ initial = DEFAULTS, tz = 'America/New_York', resultCount = 5 }) {
  const [filters, setFilters] = useState(initial)
  const [theTz, setTz] = useState(tz)
  return (
    <Filters
      filters={filters}
      setFilters={setFilters}
      tz={theTz}
      setTz={setTz}
      detectedTz="America/New_York"
      resultCount={resultCount}
    />
  )
}

describe('Filters', () => {
  it('opens search, types a query, and clears it on close', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    const input = screen.getByPlaceholderText(/Search — try/)
    fireEvent.change(input, { target: { value: 'Germany' } })
    expect(input.value).toBe('Germany')
    // Close clears the query and hides the input.
    fireEvent.click(screen.getByTitle('Hide search'))
    expect(screen.queryByPlaceholderText(/Search — try/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    expect(screen.getByPlaceholderText(/Search — try/).value).toBe('')
  })

  it('opens with search active when a query is preset', () => {
    render(<Harness initial={{ ...DEFAULTS, search: 'team: Denmark' }} />)
    expect(screen.getByPlaceholderText(/Search — try/).value).toBe('team: Denmark')
  })

  // Driven off the exported list rather than a literal, because the literal is
  // exactly what went stale: this test used to click Copa's "city: Arlington",
  // pinning a chip that matches nothing in this edition. search.test.js asserts
  // separately that every chip in the list actually returns matches.
  it('applies a search-example chip', () => {
    const example = SEARCH_EXAMPLES[1]
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Search/ }))
    fireEvent.click(screen.getByRole('button', { name: example }))
    expect(screen.getByPlaceholderText(/Search — try/).value).toBe(example)
  })

  it('toggles a stage chip on and off', () => {
    render(<Harness />)
    const chip = screen.getByRole('button', { name: 'Final' })
    fireEvent.click(chip)
    expect(chip.className).toContain('active')
    fireEvent.click(chip)
    expect(chip.className).not.toContain('active')
  })

  it('changes the timezone select', () => {
    render(<Harness />)
    // The tz select sits under the "Timezone" label.
    const select = document.querySelector('.tz-picker select')
    fireEvent.change(select, { target: { value: 'America/Los_Angeles' } })
    expect(select.value).toBe('America/Los_Angeles')
  })

  it('changes each dropdown filter', () => {
    render(<Harness />)
    const byLabel = (text) => {
      const span = screen.getByText(text)
      return span.closest('label').querySelector('select')
    }
    fireEvent.change(byLabel('Group'), { target: { value: 'C' } })
    expect(byLabel('Group').value).toBe('C')

    const teamSel = byLabel('Team')
    fireEvent.change(teamSel, { target: { value: teamSel.options[1].value } })
    expect(teamSel.value).toBe(teamSel.options[1].value)

    // Co-hosted, so every venue carries the combined host string — there is only
    // one option in this dropdown besides "all".
    fireEvent.change(byLabel('Host country'), { target: { value: 'Australia & New Zealand' } })
    expect(byLabel('Host country').value).toBe('Australia & New Zealand')

    fireEvent.change(byLabel('Region'), { target: { value: 'New South Wales' } })
    expect(byLabel('Region').value).toBe('New South Wales')

    const venueSel = byLabel('City / Stadium')
    fireEvent.change(venueSel, { target: { value: venueSel.options[1].value } })
    expect(venueSel.value).toBe(venueSel.options[1].value)

    fireEvent.change(byLabel('When'), { target: { value: 'live' } })
    expect(byLabel('When').value).toBe('live')

    fireEvent.change(byLabel('Broadcast'), { target: { value: 'spanish' } })
    expect(byLabel('Broadcast').value).toBe('spanish')
  })

  it('shows singular result count and resets filters', () => {
    render(<Harness initial={{ ...DEFAULTS, group: 'B', stages: ['Final'] }} resultCount={1} />)
    expect(screen.getByText('1 match')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reset filters/ }))
    // Group select returns to "all".
    const groupSel = screen.getByText('Group').closest('label').querySelector('select')
    expect(groupSel.value).toBe('all')
  })

  it('shows plural result count', () => {
    render(<Harness resultCount={3} />)
    expect(screen.getByText('3 matches')).toBeInTheDocument()
  })
})
