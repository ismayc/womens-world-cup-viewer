# NEWS

A dated changelog for the Women's World Cup 2023 Schedule Viewer. Each heading is
a calendar day; bullet points capture every change made that day (features, fixes,
data/source updates, deployment). Newest day on top.

## 2026-08-30

- **Production is now checked after every deploy.** Nothing in this repo ever fetched an
  absolute production URL: the build, the tests and CI all work on local files, so a host
  that was never created, a URL quietly pointing at a sibling app's site, or a broken
  calendar feed were invisible to the whole gate. A new `smoke` job runs
  `scripts/smoke-prod.mjs` after the deploy and checks the deployed site itself: every
  link-preview tag present and answering 200, the social image actually an image rather
  than the single-page-app catch-all, `coverage.json` readable, and the calendar feed real
  iCalendar with events in it. It reports rather than blocks, because Netlify publishes on
  its own trigger and a red run can just mean "not published yet".
- The feed check also compares every start time the live calendar emits against the
  committed schedule, since a feed that fetches its own upstream inherits errors the build
  corrects. Starts on days the schedule has no games for are treated as newly announced
  fixtures, not faults.
- **The calendar function is inside the coverage gate now.** `coverage.include` was
  `src/**`, so the `webcal://` subscription endpoint, real shipped code that a
  subscriber's calendar hits directly, was measured by nothing while the badge read
  100%. It is now covered, and at 100% like everything else.
- Added the missing cases for the defensive arms in the feed parser, which a
  hand-edited or unexpected upstream payload reaches. A serverless endpoint has no
  supervisor: an odd record must cost one skipped game, never a 500 that leaves every
  subscriber without a calendar.
- **The calendar function is inside the coverage gate now.** `coverage.include` was
  `src/**`, so the `webcal://` subscription endpoint, real shipped code that a
  subscriber's calendar hits directly, was measured by nothing while the badge read
  100%. Its handler had no tests at all; it now has them, and the file is gated at 100%
  like everything else. The new tests cover the parts that decide whether a subscriber
  gets a usable calendar: that an offset-less kickoff is read in the right zone, that
  knockout slot codes become readable names, and that an upstream outage produces an
  error rather than a silently empty calendar.
- **Fixed: the calendar feed called the ESPN host that blocks datacenters.** The
  function ran against `site.api.espn.com`, which returns 403 to datacenter IPs, which
  is exactly what a Netlify function is. It happened to keep working, which is the worst
  kind of correct: the block is applied at ESPN's edge and can reach these IPs at any
  time, and the failure mode is an empty calendar rather than an error. It now uses
  `site.web.api`, the same host every other viewer and every build script uses. The
  guards test only covers `scripts/` and `src/`, which is why nothing caught this.

## 2026-08-29

- **Fixed: the header said "All 32 matches · USA".** This edition is 64 matches,
  co-hosted by Australia and New Zealand. Both halves were the Copa América
  subtitle, left over from scaffolding, and they were on screen in every view on
  every load. The Calendar modal's "All 32 matches" row and the link-preview
  descriptions said 32 too; the page's own `<meta name="description">` had said 64
  all along, so the file disagreed with itself.
- **Fixed: downloaded calendar events were titled "EURO:".** `utils/ics.js` prefixed
  every event with the Euros' name, so adding a match to your calendar produced
  "EURO: Spain vs England". Everything else in that file was already correct, and
  the subscribe feed emits "Women's World Cup 2023:", so the download and the
  subscription disagreed. Both now say Women's World Cup.
- **Fixed: live scores could not load at all.** The browser code called
  `site.api.espn.com`, which now 403s any request with a browser User-Agent and
  returns no CORS headers with it. Moved to `site.web.api`, which serves the
  identical routes.
- Rewrote the repo's `verify` skill. It was a near-verbatim copy of the World Cup
  viewer's and described that app: it told you to doctor an OpenFootball feed,
  which this viewer does not use at all (ESPN is its only source), to click a
  Radial tab this app does not have, and to find "Match 101" in a 64-match
  tournament. Its one edited line even named the Copa América repo. Every selector
  in the new file was probed against this app.
- **Repo-level guards now run in the test suite.** New `test/guards.test.js`, ported from
  the FIBA viewer, which was the only repo that had one. It pins the invariants that have
  already broken a viewer in this family. The ESPN host must be `site.web.api` everywhere it
  appears: `site.api` serves the same routes but 403s on a browser User-Agent with no CORS
  headers, so it reads as healthy from curl while every deployed page loses live scores. The
  data scripts must import only Node built-ins and in-repo source, because they run in CI
  with no `npm install` of the app dependencies. Every localStorage key must carry this
  app's `wwc:` prefix and never a sibling's, because the hub and all eleven viewers are
  served from one origin and therefore share localStorage. Finally, the generated data files
  must keep their do-not-edit banner, since a hand edit to one is silently reverted by the
  next refresh run. Each guard was checked by reintroducing the bug it describes and
  confirming it fails.
- **CI now uses a per-ref concurrency group, with a repo-wide lock only on the Pages
  deploy.** This workflow had no concurrency control at all, so two pushes in quick
  succession could run their Pages deploys against each other. The naive fix, one static
  group for the whole workflow, is worse: GitHub keeps one running plus one pending run
  per group and each new arrival cancels the pending one, so a busy PR branch starves
  main's CI and its deploy. That is what happened to the NBA viewer on August 13, 2026.
  The group is now `ci-${{ github.ref }}`, giving each branch its own slot, and the
  deploy job alone carries a job-level `pages` group so Pages publishes stay serialized.
  The eight sibling repos and the workflow template in `sports-viewer-meta` already had
  this shape; these four viewers were the last without it.
- **Fixed a wrong attribution in `standings.js`.** Its header said ranking used "UEFA
  tie-breakers"; `qualification.js` implements the FIFA Women's World Cup 2023 chain, where
  goal difference comes before head-to-head. Left over from scaffolding. Comment only.
- **Fixed a racy assertion in the StatsView override test.** The test waits for a player's
  name, then reads his assists and minutes cells. The name appears as soon as the aggregate
  fetch resolves, but the values under test come from a second fetch that lands a render
  later, so on a loaded runner the assertion read the pre-override numbers. It failed once
  in three full local runs today. The assertion now waits for the overridden values instead
  of the name. Confirmed with teeth: with the override deliberately delayed the old
  assertion fails and the new one passes.

## 2026-08-16

- **The data scripts now fetch from `site.web.api.espn.com`.** ESPN's edge started
  refusing `site.api.espn.com` for requests coming from datacenter IPs — which is
  every unattended run — while answering normally from a home connection. This
  viewer's tournament is between editions, so nothing was broken today, but the
  next rebuild would have failed with `HTTP 403`. Its sibling `site.web.api` serves
  the identical routes with identical payloads and no block.
- Nothing about the app changed — same committed data, same tests.

## 2026-08-10

- **The ESPN fetch layer is now vendored, not copy-pasted.** The hardened
  transport (5 retries with exponential backoff + jitter, retry only on
  5xx/429/network errors, a 6-request concurrency cap) previously lived as an
  inline copy in each data script; it now lives in `scripts/lib/fetch.mjs`,
  vendored byte-for-byte from the canonical copy in `sports-viewer-meta`
  (which diffs every repo's copy via `check-fetch-sync`). No behavior change
  to the refresh pipeline.

## 2026-08-09

- **Finish column in the group tables.** Each standings row now ends with a
  "Fin" column showing the final group positions still arithmetically possible
  (e.g. `1–3`), collapsing to a single gold number once the finish is locked.
  The bounds come from the clinch engine's own enumeration — exact (goal
  difference and head-to-head included, per the 2023 tie-break order of points →
  goal difference → goals scored → head-to-head → fair play) whenever the
  group's remaining scorelines are enumerable, sound points-only bounds
  otherwise — via a new `groupPositionBounds` export, so the column can never
  contradict the badges. With the edition finished, all eight groups show their
  locked 1–4 order. Ported from the World Cup sibling; mirrors the Finish
  column the WNBA/NBA/NFL viewers carry.

## 2026-08-09

- **Card/sub backfill finds every match now.** `historyDates` filed each
  kickoff under its UTC day, but ESPN buckets `dates=` queries by the
  US-Eastern day. Seven Oceania lunchtime kickoffs land just past midnight
  UTC; the QF (Spain–Netherlands) sat alone on its Eastern day, so its cards
  and substitutions were never backfilled. Days are now computed in
  America/New_York, with a regression test on that QF.

## 2026-08-08

- **Condensed view strip.** Once the header's view switch scrolls out of view, a
  slim fixed strip pins to the top showing the current view; tapping it drops
  down the full tab set, so switching views never means scrolling back to the
  top. The sticky filters panel and Week column heads offset beneath it. Rolled
  out family-wide from the WNBA/NBA viewers.

## 2026-08-05

- **Toolchain upgrade.** Vite 5 → 8 (Rolldown), Vitest + coverage-v8 2 → 4,
  `@vitejs/plugin-react` 4 → 6, jsdom 25 → 30, React 18 → 19, jest-dom 6 → 7.
  React 19 was verified in a browser across the family.
- **Coverage badge back to 100%.** Vitest 4's v8 provider counts arms Vitest 2
  skipped, so the badge slipped on the upgrade. Nothing had regressed; the drift
  had simply been invisible, and it was closed with tests rather than waved
  through.
- **100% on every metric, and a gate that keeps it there.** Branch coverage
  joined statements, functions and lines at 100%, and `vite.config.js` now
  carries a `thresholds` block so the suite (and CI's `coverage:badge` step)
  fails the moment any of the four slips. The tests added along the way describe
  real states rather than chasing the counter: an event ESPN publishes with no
  status and no kind, a log item with no event reference, a stat line with no
  numbers, a shootout read from the second-named team's side, a scorer's table
  seen from the home side, an enrichment that arrives late or empty, a candidate
  and a fixture the flag table has never heard of, a soft tie-break decided on
  cards, a projected opponent the bracket cannot name yet, a team in the Final
  it has not played, a group result naming a team the committed table does not
  list, and a results load that was superseded rather than failed.
- **Two fixtures that were testing nothing.** `cov-scenarios` and `cov-tiebreak`
  were built on a sibling tournament's Group A. The ranker seeds its rows from
  the committed group, so those boards ranked a blank table and their assertions
  held without a single result being read. Both now use this edition's teams,
  and the tie-break one asserts the order the criteria actually produce.
- **Dead defensive arms removed or documented.** Where a fallback could not be
  reached — a flag lookup on a name that always comes from the committed team
  table, a group the ranker always seeds, an entry-round slot that always parses
  — it is either gone or carries an inline `/* v8 ignore next -- why */` with the
  reason, never a lowered threshold.

## 2026-07-29

First release, built over 28–29 July 2026 from the sibling
[`copa-america-viewer`](https://github.com/ismayc/copa-america-viewer) — itself
descended from [`world-cup-viewer`](https://github.com/ismayc/world-cup-viewer)
and [`football-euros-viewer`](https://github.com/ismayc/football-euros-viewer) —
and re-pointed at a completed edition so the next Women's World Cup can slot
straight in.

The scaffold was a **4 groups / 32 matches / quarter-final-entry** tournament. This
is **8 groups / 64 matches / Round-of-16 entry**, which turned out to touch far
more than the numbers.

### Data

- **Women's World Cup 2023 schedule and results** — all 64 matches, 32 teams,
  10 venues across two countries, 164 goals. `scripts/fetch-tournament.mjs`
  generates `src/data/{matches,teams,venues}.js` from **two** keyless public
  sources: **FIFA's own match calendar** (`api.fifa.com`) as the authority for
  official match numbers 1–64, kickoffs, venues and scores, and **ESPN's
  `fifa.wwc` scoreboard** for per-match event ids, group labels and goal scorers
  with minutes. The build fails unless the two agree on all 64 kickoffs, venues
  and scores.
- **There is no OpenFootball source for this edition, in any format.** It
  publishes the men's World Cups only — the whole org was checked. FIFA's API
  takes the "source of record" role the siblings give OpenFootball, which is a
  straight upgrade: it is the authority the men's viewer validates *against*, and
  it carries the official match numbering. `src/services/results.js` and its
  `parseCupTxt` runtime parser are gone.
- **No single tournament timezone.** Every sibling restates kickoffs in the one
  zone its organiser published in. The 10 host stadiums span four southern-winter
  offsets — +12 New Zealand, +10 eastern Australia, +09:30 Adelaide, +08 Perth —
  so each match's `ko` carries its **own venue's** offset. All four are standard
  time; no venue observed DST during the finals.
- **Venue names follow FIFA, not ESPN.** FIFA bans sponsor names at its
  tournaments, so matches were played and broadcast as Stadium Australia,
  Wellington Regional Stadium, … while ESPN files them as Accor Stadium, Sky
  Stadium, … **9 of the 10 differ** (Eden Park is the only match). The official
  names are what the app shows; the ESPN name is only a join key, and
  `VENUE_ALIASES` in the Netlify calendar function keeps the `.ics` feed agreeing
  with the app.
- **Host cities carry their Indigenous names too** — Sydney / Gadigal, Auckland /
  Tāmaki Makaurau, Adelaide / Tarntanya, … as FIFA published them.
- **Verified the committed data independently**: 64 matches (48 group / 8 R16 /
  4 QF / 2 SF / 1 third-place / 1 Final), 8 groups of 4, 10 venues, 164 goals,
  and every scored match's goal count equal to its scoreline.

### Format changes from the siblings

- **Eight groups of four, top two advance, no best-third race.** 2023 was the
  first 32-team women's World Cup; the 24-team 2019 edition did have best thirds,
  this one does not. Clinch, elimination and opponent-lock detection stay purely
  per-group, with no cross-group bounding and no combinations table.
  `ADVANCING_PER_GROUP` in `utils/qualification.js` remains the single source of
  truth the engines read.
- **The knockout starts at the Round of 16** (`ENTRY_ROUND = 'R16'`), so the
  bracket has four rounds and the Outlook tab is the R16 Outlook.
- **The entry-round pairing is NOT the men's pattern.** Each group meets the group
  **two letters along** — 1A-2C, 1B-2D, 1E-2G, 1F-2H — so the halves are A,C,E,G
  against B,D,F,H, and a group's winner and runner-up go to two *different* ties.
  A consequence worth knowing: the two co-hosts, New Zealand (A) and Australia
  (B), were in opposite halves and could only have met in the Final. Verified all
  16 knockout matchups (teams *and* bracket order) against the official 2023
  bracket; `npm run check:bracket` re-derives them from the group results on
  demand.
- **FIFA 2023 tie-breakers** replace CONMEBOL's: points → **overall goal
  difference → goals scored** → head-to-head points/GD/goals → **fair play
  points** → drawing of lots. Two traps here. Overall GD comes *before*
  head-to-head, which is the reverse of both the Euro and the 2026 men's World Cup
  — Group H is the live proof, where Morocco **beat** Colombia 1–0 yet finished
  below them on goal difference (+2 vs −4). And criterion 7 is **fair play
  points**, scored additively: yellow −1, indirect red −3, direct red −4. The
  scaffold had Copa's lexicographic encoding (a red worth −100, outranking any
  number of yellows); the two competitions genuinely score conduct differently.
- **The last criterion is still a drawing of lots**, not FIFA ranking — that
  change came with the 2026 men's edition. `byLots` stands in with a stable
  alphabetical order, and there is deliberately no `fifaRanking.js`.
- **The third-place play-off stays** (match 63, Sweden 2–0 Australia), as in the
  men's World Cup and unlike the European Championship.
- **Extra time before every shootout**, so `pens` here **always** implies `aet`:
  extra time on 52, 54, 57 and 59, penalties on 52, 54 and 59 (match 57, Spain 2–1
  Netherlands, was settled *in* extra time). This is the exact opposite of Copa
  América 2024, where only the Final went to extra time. The rule must never be
  copied between the two repos in either direction.
- **Co-hosting breaks the country filter, by nature.** Every venue's `country` is
  the single combined string "Australia & New Zealand", so either host name
  matches all 64 and the field cannot narrow anything; `region` (Australian state
  or New Zealand region) is what separates the hosts.

### Source bugs found and fixed while porting

Ten, all inherited from the scaffold and all invisible to a green suite:

- **`Bracket.jsx` never rendered the Round of 16.** `BRACKET` had it, but the
  component's `ROUNDS` and its wide layout both started at the quarter-finals, so
  **8 of the 64 matches were invisible** and the mobile round selector showed 3
  pills instead of 4.
- **The whole app called the entry round "quarter-final" — 30 sites.** The worst
  was `MatchCard` captioning a round-of-16 tie `Quarter-final · Match 49`. Also
  Standings' "As it stands", ScenariosView's projections, OutlookView,
  GroupGamesModal, PathPicker, the clinch badge titles, `clinchHeadline`, and the
  outlook worker.
- **The ESPN player-stats endpoints still pointed at Copa América 2024.** The
  storage keys had been rebranded to `wwc:` while the URLs had not, so
  `espnStats.js` asked for `leagues/conmebol.america/seasons/2024` — a
  season-scoped URL with no event id, which therefore did not fail. It returned
  **200 with the men's Copa América leaders** (Lautaro Martínez topping it on 5
  goals), whose assists and minutes were then name-joined against Women's World
  Cup scorers; nothing matched, so the Golden Boot table quietly dropped its
  tie-breaker columns. Now `fifa.wwc/seasons/2023`, verified end-to-end (Hinata
  Miyazawa: 5 goals, 1 assist, 338 minutes). `espnMatchStats.js` carried the same
  wrong slug; that endpoint resolves by event id and currently ignores the slug,
  so it was wrong without being broken, and is corrected anyway.
  `test/stats-endpoints.test.js` now guards every ESPN URL against the four
  sibling league slugs — this bug survived precisely because the stats layer is
  the one module the suite does not otherwise exercise.
- **`index.html` bootstrapped the theme from `copa:theme`,** a key this app never
  writes, so the no-flash restore was silently dead. The earlier storage-prefix
  sweep had covered only `src/` and `test/`. Now `wwc:theme`.
- **The generated data headers credited OpenFootball for goal detail** while the
  same script's own header said this edition has no OpenFootball source at all.
  Goal detail comes from ESPN's event feed. The emitter also stamped the venues
  file with the *Copa* timezone note ("the hosts span US Eastern, Central, Arizona
  … and Pacific"). Both fixed in `fetch-tournament.mjs` and regenerated — with the
  regeneration diffed to confirm **zero row drift**, so the emitter provably
  reproduces the committed data.
- **The scoped-search example chips were unmatchable.** `team: Mexico` (Mexico
  never played this edition) and `city: Arlington` (no such venue) are *buttons* —
  clicking either emptied the schedule. Now `team: Japan` / `city: Sydney`, with
  `SEARCH_EXAMPLES` exported and asserted against the real data so a future
  re-scaffold cannot leave a dead chip behind.
- **`matchCountry` carried a dead US synonym table** (`usa` / `us` / `america`) and
  a comment claiming the venue table spells the host "United States". No venue
  here spells a country any of those ways, so the branch could never fire.
- **Standings' tie-breaker tooltip said "cards"** where the criterion is fair play
  points.
- **The `Filters` search placeholder** likewise named a team and a host city from
  the scaffold's tournament, neither of which appears in this one. Now
  `team: Norway` / `city: Sydney`.
- **`outlookEnum.js` had a `v8 ignore` on a REACHABLE branch.** With eight groups,
  three open games in a group is 12,845,056 combinations — past `MAX_ITERS` (12M) —
  so `chooseCaps`' walk-down fallback genuinely runs. (The Copa version's "12⁴ =
  20,736, so this can never overflow" reasoning does not survive the format
  change.) The ignore is gone and the branch is covered. It is unreachable only
  *from the UI*, because `OutlookView` refuses to enumerate above
  `MAX_REMAINING = 14` open games, where the worst case is ~330k.

### Vacuous tests found and fixed

Five tests that passed while proving nothing — a green suite is not a covered one:

- **`cov-app.test.jsx`** built its "archived group stage" feed from `MATCHES`,
  which its own `vi.mock` had blanked, so it served 64 *unplayed* fixtures. The
  mock catches the test file's own import too; it now uses `vi.importActual`.
- **`espn-coverage.test.js`** keyed a live map on `pairKey('Argentina','Canada')`
  — two teams that never meet in this tournament — so `applyLive` never consulted
  it and the assertion held over an empty map.
- **`cov-group-games-modal.test.jsx`** voided M9 and set M2 live to exercise the
  badges, but the modal renders only the selected group and neither match is in
  Group A. Now M3 and M33.
- **`app-coverage.test.jsx`** had a **duplicate `LIVE_SOURCE` import**, a
  redeclaration that failed the whole file at parse time.
- **`stats-view.test.jsx`** cast men's Copa scorers (Raúl Jiménez, Shamar
  Nicholson, Enner Valencia) in a Women's World Cup viewer.

### Removed: the radial bracket view

The sibling's radial view was structurally quarter-final-entry — eight outer leaf
slots taken from `BRACKET.*.QF`, two rings (`RING = { QF, SF }`) — so it could
never show a Round of 16. Removed rather than rebuilt: `RadialBracket.jsx` and its
test are deleted, along with the `VIEWS` entry, the `view === 'radial'` branch, the
`path-to-final` block, and 12 radial-only CSS rules (~2 KB). An old
`?view=radial` deep link degrades to the Bracket, which is pinned by a test. To
bring one back for a future edition, take it from `copa-america-viewer` and
re-derive the rings.

Note for anyone pruning further: the two `--page-bg: radial-gradient(...)`
declarations in `index.css` are the **page background**, not radial-view CSS.

### Sources

- **One runtime feed, not three.** ESPN overlays a live score and clock onto a
  committed schedule that already holds every result. OpenFootball has no women's
  edition and TheSportsDB's free tier has no women's data, so `results.js`,
  `thesportsdb.js` and `reconcile.js` all have no counterpart here.
- **No "confirmed by N sources" badge.** With one runtime feed it would be
  permanently inert, and counting the committed schedule as a second source would
  overclaim, since that schedule is itself built partly from ESPN. Tests asserting
  `scoreCheck` were deleted rather than repaired, and `ScoreCheck.jsx` is gone.
- **`calendar.js` rewritten against ESPN** (`parseFixtures` → `parseScoreboard`):
  one date-range query returns all 64 with venue, round and score. New fixture
  `test/fixtures/espn-scoreboard-snapshot.json`; `copa-txt-snapshot.txt` deleted.
- **US broadcast rights restated for this tournament.** FOX Sports held English
  rights, splitting all 64 between free-to-air **FOX (29, including every USA
  match)** and cable **FS1 (35)** — counted against ESPN's own broadcast fields.
  Telemundo held Spanish rights, splitting them **Telemundo 33 / Universo 31**
  with every match on Peacock. Both differ from the Copa sibling's holders
  (there is no FS2 match at all here, and no TelevisaUnivision/ViX), so neither
  list may be copied either way.

### Testing

- **776 tests across 79 files; 99.59% statements, 100% functions, 100% on the
  coverage badge.** The badge rounds statements (≥99.5% prints 100%), which is
  what "100% coverage" means in this family; there is no threshold in
  `vite.config.js`. The remaining 26 uncovered statements sit in the player-popup
  stats layer, the same files the CI-green sibling leaves uncovered.
- **The suite is pinned to `Australia/Sydney`** in `vite.config.js`, chosen by
  measurement: 0 of 64 matches change calendar day under it.
- **`test/helpers/tournament.js` gained `espnScoreboard(matches)`**, which builds
  an ESPN-shaped payload from committed matches for any test that needs results
  over the wire.
- **Every new guard was teeth-checked** — the fix was reverted to confirm the test
  actually reddens, rather than trusting a green run.

### Icons & share image

- **A new mark: the Southern Cross (Crux)** — the one device carried on **both**
  co-hosts' flags. Four stars, which is exactly the intersection: New Zealand
  bears these four, Australia the same four plus Epsilon Crucis, so four favours
  neither host. Star positions are the constellation's real right ascension and
  declination on a local tangent projection, so the shape is the sky's rather than
  a sketch, and the furthest point sits 201px from centre — inside the 205px
  maskable safe radius, so Android's circle crop never clips a star. Filled
  polygons only, never strokes, because ImageMagick drops stroke colour.
- Per the family rule the app takes its **own** device: the bare soccer ball
  belongs to `world-cup-viewer`, the ball on a saltire to `football-euros-viewer`,
  the Sol de Mayo to `copa-america-viewer`.
- **`favicon.svg` deliberately keeps its dark ground**, departing from the family's
  favicon split. That rule assumes a self-contrasting mark; white stars on
  transparency vanish completely in a light browser tab. (`copa-america-viewer`
  keeps its ground for the same reason.) Verified at 32px and 16px on both light
  and dark.
- `og-image.svg` rebuilt with the same mark and this edition's copy. Note it must
  be rasterized with headless Chrome, not `magick`: there is no fontconfig font
  registered here and no `rsvg-convert`, so ImageMagick cannot render its `<text>`
  elements at all.

### Deployment

- Public GitHub repo `ismayc/womens-world-cup-viewer`; GitHub Pages and Netlify
  both deploy from `main` on a green CI run.
- `netlify/functions/calendar.js` is **ESM on purpose** — the package is
  `"type": "module"`, and a CommonJS function 502s on the Netlify Git-build path.
