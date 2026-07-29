// Home timezone(s) for each team's country, keyed by the exact team name used in
// teams.js. Countries that span more than one zone list each one (ordered
// west→east) so a hover can show every local kickoff time a fan back home might
// read off their own clock. Same-offset zones are collapsed at render time (see
// teamLocalKickoffs in utils/time.js), so listing a representative set per
// offset is enough — we don't enumerate every micro-zone.
//
// This is the widest field in the family: 32 teams across six continents. Most
// are single-zone, but several genuinely are not, and those are the reason the
// hover exists — the United States runs six zones, Canada six, Australia five,
// Brazil four, and Spain and Portugal each keep an Atlantic-island zone an hour
// behind the mainland. France is listed as métropole only: its overseas
// départements span many more zones, but the hover is about where the national
// team's supporters mostly are, not the full extent of a state.
export const TEAM_TIMEZONES = {
  // Group A
  'New Zealand': ['Pacific/Auckland', 'Pacific/Chatham'],
  Norway: ['Europe/Oslo'],
  Philippines: ['Asia/Manila'],
  Switzerland: ['Europe/Zurich'],

  // Group B
  Australia: [
    'Australia/Perth',
    'Australia/Darwin',
    'Australia/Adelaide',
    'Australia/Brisbane',
    'Australia/Sydney',
  ],
  Canada: [
    'America/Vancouver',
    'America/Edmonton',
    'America/Winnipeg',
    'America/Toronto',
    'America/Halifax',
    'America/St_Johns',
  ],
  Nigeria: ['Africa/Lagos'],
  'Republic of Ireland': ['Europe/Dublin'],

  // Group C
  'Costa Rica': ['America/Costa_Rica'],
  Japan: ['Asia/Tokyo'],
  Spain: ['Atlantic/Canary', 'Europe/Madrid'],
  Zambia: ['Africa/Lusaka'],

  // Group D
  China: ['Asia/Shanghai'],
  Denmark: ['Europe/Copenhagen'],
  England: ['Europe/London'],
  Haiti: ['America/Port-au-Prince'],

  // Group E
  Netherlands: ['Europe/Amsterdam'],
  Portugal: ['Atlantic/Azores', 'Europe/Lisbon'],
  'United States': [
    'Pacific/Honolulu',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
  ],
  Vietnam: ['Asia/Ho_Chi_Minh'],

  // Group F
  Brazil: ['America/Rio_Branco', 'America/Manaus', 'America/Sao_Paulo', 'America/Noronha'],
  France: ['Europe/Paris'],
  Jamaica: ['America/Jamaica'],
  Panama: ['America/Panama'],

  // Group G
  Argentina: ['America/Argentina/Buenos_Aires'],
  Italy: ['Europe/Rome'],
  'South Africa': ['Africa/Johannesburg'],
  Sweden: ['Europe/Stockholm'],

  // Group H
  Colombia: ['America/Bogota'],
  Germany: ['Europe/Berlin'],
  Morocco: ['Africa/Casablanca'],
  'South Korea': ['Asia/Seoul'],
}
