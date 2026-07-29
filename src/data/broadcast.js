// US broadcast & streaming for the FIFA Women's World Cup 2023.
//
// FOX Sports held the English-language US rights and split all 64 matches
// between the free-to-air FOX network (29, including every USA match) and cable
// FS1 (35) — confirmed against ESPN's own broadcast fields for the tournament
// window, which count exactly 29 and 35. Unlike the Copa América sibling there
// is no FS2 match at all, so listing it would be wrong here.
//
// Telemundo (NBCUniversal) held the Spanish-language rights, splitting the 64
// between the free-to-air Telemundo network (33) and cable Universo (31), with
// every match streaming on Peacock. That is a different rights-holder from the
// Copa sibling's TelevisaUnivision/ViX — do not copy the list either way.
//
// Coverage is stated tournament-wide rather than per match, matching the sibling
// viewers: ESPN's per-match channel field intermittently drops and restores on
// matches this old, so committing it would flap against itself on regeneration
// for no real gain.
export const US_BROADCAST = {
  english: {
    language: 'English',
    tv: ['FOX', 'FS1'],
    freeOverTheAir: 'FOX',
    streaming: ['Fubo', 'YouTube TV', 'Hulu + Live TV', 'Sling TV'],
  },
  spanish: {
    language: 'Spanish',
    tv: ['Telemundo', 'Universo'],
    freeOverTheAir: 'Telemundo',
    streaming: ['Peacock', 'Fubo'],
  },
}
