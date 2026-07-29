# Women's World Cup 2023 Schedule Viewer

[![CI](https://github.com/ismayc/womens-world-cup-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/ismayc/womens-world-cup-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/endpoint?url=https://womens-world-cup-viewer.netlify.app/coverage.json)](https://github.com/ismayc/womens-world-cup-viewer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A React + Vite web app showing all 64 matches of the FIFA Women's World Cup 2023
(Australia & New Zealand) in **your** timezone, with where to watch, host
city/stadium, a bracket, group standings, and the full tie-breaker and
qualification maths.

🔗 **Live:** https://womens-world-cup-viewer.netlify.app · https://ismayc.github.io/womens-world-cup-viewer/

**This is a completed edition.** The Women's World Cup 2023 finished on 20 August
2023 (Spain 1–0 England), and the schedule ships with every result in it. It is
kept here as a working archive — and as the shape the next Women's World Cup can
slot straight into.

It was also the **first 32-team** women's World Cup: 8 groups of 4, 48 group
matches, a Round of 16, and 64 matches in all. The 24-team 2019 edition had a
best-third race; this one does not.

## Features

- **Your timezone** — kickoff times auto-convert to your detected timezone
  (switchable to 20+), with stadium-local time shown when it differs. This
  edition has **no single tournament timezone**: the 10 venues span four
  southern-winter offsets — New Zealand (+12), eastern Australia (+10), Adelaide
  (+09:30) and Perth (+08) — so each match stores its own venue's offset.
- **Hover for home-country time** — hover a team in any view to see when the
  match kicked off back home; countries spanning multiple time zones (Australia,
  the United States, Brazil, Canada, …) list each distinct local time.
- **Follow teams** — star any team to highlight it everywhere and filter to a
  one-click "⭐ My Teams" view (saved in your browser).
- **Next-match bar** — a countdown to the next kickoff (prioritising your
  followed teams, or "Live now"), with a jump-to-match button.
- **Goal alerts** — opt-in 🔔 browser notifications when a goal is scored (scorer,
  minute, and the running score), scoped to your followed teams or all matches.
- **Seven views** — chronological schedule, a Sunday–Saturday week calendar,
  group standings, Scenarios, R16 Outlook, the knockout bracket, and tournament
  stats. The two group-stage tools retire once the group stage is over.
- **Phone-friendly schedule** — past days collapse to tappable headers by default
  (or hide entirely), so the schedule opens on the day's games rather than a long
  scroll.
- **Match detail** — click any match for full venue/time/broadcast info, the
  status/clock, and a minute-by-minute event timeline (goals ⚽, cards 🟨🟥).
- **How to watch (US)** — English (FOX/FS1) & Spanish (Telemundo/Universo) TV and
  streaming per match; free over-the-air channels flagged. FOX carried 29 matches
  free-to-air including every USA match, FS1 the other 35.
- **Venues** — all 10 host stadiums with city and region, each city under both its
  English and its Indigenous name (Sydney / Gadigal, Auckland / Tāmaki Makaurau,
  …), as FIFA published them. Two of the stadiums are in Sydney, so venues are
  keyed by stadium rather than by city.
- **Filtering** — search, stage, group, team, host country, region, city/stadium,
  timeframe, and broadcast language. The scoped-search syntax (`team: Japan`,
  `city: Sydney`, `stage: Final`, `group: C`) works across every view. Note that
  because the edition was co-hosted, every venue's country is the one combined
  string "Australia & New Zealand" — either host name matches all 64, and
  **`region`** (state or NZ region) is the filter that separates the two hosts.
- **Group standings & qualification** — all eight tables with FIFA's official
  tie-breakers (points → **overall goal difference → goals scored** → head-to-head
  points → head-to-head goal difference → head-to-head goals → fair play points →
  drawing of lots), and who advances. Note the order: FIFA put overall goal
  difference *before* head-to-head here, the reverse of both the Euro and the 2026
  men's World Cup. Group H is the live proof — Morocco **beat** Colombia 1–0 yet
  finished below them, on goal difference. A ⚖️ marker (and a plain-language note)
  explains any placing that came down to fair play points or to the drawing of
  lots.
- **Fair play points, scored FIFA's way** — the seventh criterion is additive, not
  lexicographic: yellow −1, indirect red (second yellow) −3, direct red −4, yellow
  plus direct red −5. Four yellows really do cost the same as one direct red.
- **Clinch & elimination detection** — teams are marked 🥇 Won group / 🥈 Group
  runner-up / ✅ Through / ❌ Out the moment the outcome is mathematically
  guaranteed, from an exact scoreline-enumeration engine. Only the top two of each
  group advance and there is no best-third race, so a team's fate depends on its
  own group alone — no cross-group bounding needed. Shown in the group tables and
  schedule cards, and resolved into the bracket (a clinched "Winner Group X" slot
  fills in everywhere).
- **"As it stands" round of 16** — under each group, where its current 1st / 2nd
  would land in the knockout, with concrete opponents. Each projected match number
  links straight to that tie on the bracket, and the whole block can be toggled
  off.
- **R16 Outlook** — while the group stage is in play, the share of remaining
  outcomes that put each team in each open round-of-16 slot, computed by
  enumerating every still-possible group result over real **goal differences**
  (not just win/draw/loss) — which matters here, because goal difference is the
  first tie-breaker.
- **Scenarios** — pick results for the remaining group games and watch the tables,
  qualification and projected bracket move with you. A projected matchup gets a ✔️
  once it is mathematically locked, which can happen while other groups are still
  playing: a Winner-A v Runner-up-C tie is fixed the moment those two groups are
  settled, whatever the others do.
- **Bracket** — two-sided knockout bracket that fills in as teams resolve, from
  the Round of 16 through to the Final. Slots awaiting a result preview the
  **potential matchup**: a "Winner Match N" box shows the two candidate teams of
  the tie feeding it, cascading round by round. Like the men's World Cup and unlike
  the European Championship, this tournament plays a **third-place play-off**
  (match 63, Sweden 2–0 Australia), which hangs off the bracket beside the Final
  and is fed by "Loser Match N".
- **Stats** — the Golden Boot race (ties never split, penalties noted, own goals
  excluded — Hinata Miyazawa took it with 5) plus tournament totals: matches,
  goals, goals per match, extra-time games and shootouts. Knockout match details
  add a **tale of the tape** — the two teams' tournament records side by side.
- **Add to calendar** — per-match `.ics` download, plus a `webcal://` subscription
  feed (all matches or just your teams).
- **Spoiler-free mode** — hide scores globally, per day, or per match.
- **Light/dark theme** — follows your system preference, with no flash on load.
- **Shareable URLs** — view, timezone, spoiler mode, and filters persist to the
  query string; links unfurl with a title/description preview in chat apps.
- **Accessible** — keyboard-navigable, focus-trapped modals that restore focus on
  close, and screen-reader labels on live/score badges.

### The knockout pairing is not the men's pattern

Each group is drawn against the group **two letters along**, so the halves are the
odd-lettered groups against the even-lettered ones:

|  | round-of-16 pairing | halves |
|---|---|---|
| men's 2022 (32 teams) | 1A-2B, 1C-2D, 1E-2F, 1G-2H | A,B,C,D vs E,F,G,H |
| **Women's 2023** | **1A-2C, 1B-2D, 1E-2G, 1F-2H** | **A,C,E,G vs B,D,F,H** |

One consequence: the two co-hosts, New Zealand (A) and Australia (B), were in
**opposite halves** and could only ever have met in the Final. Do not "correct"
this toward the men's pattern — `npm run check:bracket` re-derives all 16 knockout
matchups from the group results and fails on any divergence.

### The live layer

The app keeps its full live-results layer even though this edition is finished,
so a future tournament's data drops in without re-plumbing: a live in-match score
+ clock overlaid from [ESPN](https://www.espn.com/soccer/) while games are
underway, on top of a committed schedule that already holds every result.

**One runtime source, not three.** The sibling viewers reconcile final scores
across [OpenFootball](https://github.com/openfootball) and
[TheSportsDB](https://www.thesportsdb.com/) as well. Neither carries this
competition: OpenFootball publishes the men's World Cups only — there is no
women's repo in any format — and TheSportsDB's free tier has no women's data.
Because only one runtime feed exists, there is deliberately **no "confirmed by N
sources" badge** here: it would be permanently inert, and counting the committed
schedule as a second source would overclaim, since that schedule is itself built
partly from ESPN.

## Develop

```bash
npm install
npm run dev             # http://localhost:5173
npm run build           # production build to dist/
npm run preview         # preview the production build
npm test                # run the Vitest suite
npm run coverage:badge  # tests + coverage, and refresh the badge endpoint
npm run check:bracket   # re-derive the 16 knockout matchups and verify them
```

Every push runs the tests + build in GitHub Actions; pushes to `main` deploy to
Netlify and GitHub Pages only if they pass.

New to the code? [`ARCHITECTURE.md`](./ARCHITECTURE.md) maps the modules and how
data flows from the static schedule + live feed through the standings, clinch,
projection and bracket-resolution layers to the views.

## Regenerating the data

```bash
npm run fetch:tournament   # rebuild src/data/{matches,teams,venues}.js
npm run fixture:official   # rebuild test/fixtures/official-kickoffs.js
```

`scripts/fetch-tournament.mjs` builds the committed schedule from **two
independent, keyless public sources**: FIFA's own match calendar
(`api.fifa.com`) is the **authority** for official match numbers, kickoff
instants, venues and scores, while **ESPN** supplies per-match event ids (which is
what lets the match-detail modal pull a three-year-old box score at runtime),
group labels and goal scorers with minutes. **The build fails unless the two agree
on all 64 kickoffs, venues and scores** — so a silent data drift can't land.

`scripts/make-official-fixture.mjs` freezes FIFA's view of the tournament into
`test/fixtures/official-kickoffs.js`, which the suite asserts the committed data
against on every run. Its honest limit is documented at the top of that script:
because the builder already validates against FIFA at build time, the fixture is
not a fully independent third opinion the way the siblings' OpenFootball fixture
was — what it adds is a *frozen, committed* record of that agreement, checked on
every test run rather than only when someone regenerates.

### Venue names follow FIFA, not ESPN

FIFA bans sponsor names at its tournaments, so the matches were played and
broadcast under official names while ESPN files them under commercial ones — 9 of
the 10 venues differ (Stadium Australia is ESPN's "Accor Stadium"). The official
names are what the app shows; the ESPN name is only a join key. The Netlify
calendar function carries the same alias table so the `.ics` feed agrees with the
app.

## Data sources

- **Schedule, groups, venues** — FIFA's match calendar as the authority,
  cross-checked at build time against ESPN's `fifa.wwc` scoreboard and frozen into
  [`test/fixtures/official-kickoffs.js`](./test/fixtures/official-kickoffs.js).
  The suite asserts every match's kickoff (to the minute, with its venue's own
  offset), venue, knockout-bracket slot, and group assignment, plus structural
  invariants (complete round-robins, simultaneous final-matchday kickoffs, no team
  double-booked, valid bracket references, and every match's goal count equal to
  its scoreline).
- **Broadcast** — FOX Sports (English) and NBCUniversal / Telemundo (Spanish) US
  rights, stated tournament-wide rather than per match: ESPN's per-match channel
  field intermittently drops and restores on matches this old, so committing it
  would flap against itself on regeneration.
- **Results (source of record)** — FIFA's API, with goal timelines from ESPN's
  event feed.
- **Live in-match scores** — ESPN's public scoreboard API (free, no API key,
  CORS-open). Used only while a match is underway or just finished; a match that
  already has a committed score is never overwritten.

### A note on extra time

Every knockout tie here played **extra time before any shootout**, so a shootout
always implies `aet`: extra time on matches 52, 54, 57 and 59, penalties on 52, 54
and 59. Match 57 (Spain 2–1 Netherlands) was settled *in* extra time with no
shootout. This is the **exact opposite** of the Copa América 2024 sibling, where
only the Final went to extra time and `pens` without `aet` is correct — a
"helpful" fix that copies either repo's rule into the other is a bug.

See [`NEWS.md`](./NEWS.md) for the changelog.

## Credits

Created by [Chester Ismay](https://chester.rbind.io). Source on
[GitHub](https://github.com/ismayc/womens-world-cup-viewer).

The app icon and share image use the Southern Cross (Crux) — the one device
carried on **both** co-hosts' flags — drawn from the constellation's real
coordinates.

## Disclaimer

An unofficial, non-commercial fan project. **Not affiliated with, endorsed by, or
sponsored by FIFA.** “FIFA Women's World Cup”, and team, broadcaster, and venue
names are trademarks of their respective owners. Schedule and results data come
from [FIFA's public match calendar](https://api.fifa.com/) and
[ESPN](https://www.espn.com/soccer/); live in-match scores come from ESPN.
