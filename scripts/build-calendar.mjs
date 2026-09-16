// Generate the static, subscribable calendar feed: public/calendar.ics.
//
// The 2023 tournament is complete and frozen, so the feed is a fixed file, not a
// live endpoint. The old approach backed /calendar.ics with a Netlify function that
// fetched ESPN's scoreboard on each request. That no longer works: ESPN dropped
// date-RANGE scoreboard queries family-wide (the feed's `dates=A-B` window now
// returns HTTP 400), so the function's `if (!res.ok) return 502` made the production
// feed a hard 502. A static file built from the committed schedule sidesteps it and,
// for a completed tournament, is the right shape anyway: nothing is live to track.
//
// The events are produced by the app's OWN builder (utils/ics.js buildICSCollection,
// the exact code behind the "Download all matches" button), so a subscribed calendar
// and a downloaded file are byte-for-byte identical apart from DTSTAMP. `matches` is
// resolveBracket(MATCHES, computeClinch(MATCHES)), the same array the app feeds the
// calendar once the live and history overlays are empty (a finished edition).
//
// DTSTAMP ("when this iCal object was authored") is frozen to a constant. The app's
// live download stamps it with the current time, which is correct for a fresh
// download but would make this committed file churn on every regenerate. A finished
// tournament's feed is authored once; the constant below is the day after the Final.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { MATCHES } from '../src/data/matches.js'
import { resolveBracket } from '../src/utils/bracketResolve.js'
import { computeClinch } from '../src/utils/clinch.js'
import { buildICSCollection } from '../src/utils/ics.js'

// The day after the 2023 Final (played 2023-08-20). A static feed is authored once.
const FROZEN_DTSTAMP = '20230821T000000Z'

export function buildCalendar() {
  const matches = resolveBracket(MATCHES, computeClinch(MATCHES))
  const raw = buildICSCollection(matches)
  // Freeze the only non-deterministic field so the committed file is stable.
  return raw.replace(/DTSTAMP:\d{8}T\d{6}Z/g, `DTSTAMP:${FROZEN_DTSTAMP}`)
}

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'calendar.ics')

// Written whenever this module is the entry point (build:calendar and the prebuild
// hook); importing it from a test only pulls in buildCalendar().
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, buildCalendar())
  console.log(`Wrote ${OUT} (${MATCHES.length} matches)`)
}
