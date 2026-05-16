// =====================================================================
// Sprite overrides — maps every seed `id` to a sprite-sheet team.
//
// The user supplied a hand-drawn spritesheet (`/public/clubs-sprite.png`)
// containing 90 fictional-twist English clubs across four sections
// (Premier · Championship · Division 1 · Division 2). We sliced each
// crest into `/public/badges/crest-<section>-<NN>.png` and now mate
// those crests + sprite team names back onto our existing 80 procedural
// seeds, preserving every other seed property (colours, personality,
// stadium, founding year, rival relationship, ...).
//
// Keep this file as the single source of truth for sprite names so
// nothing else in the codebase has to know about sprite slicing — the
// team generator just reads `displayFor(seedId)` and uses what it gets.
// =====================================================================

interface SpriteOverride {
  /** Full display name as it appears under the sprite crest. */
  name: string;
  /** Three-letter scoreboard tag (badge initials, table abbrev, etc.). */
  shortName: string;
  /** Filename inside `/public/badges/`. */
  crestSprite: string;
  /** Optional refreshed home city — falls back to the seed's `city`
   * when omitted to avoid breaking unrelated copy. */
  city?: string;
}

// =====================================================================
// PREMIER DIVISION (20)
// 19 sprite Premier crests + sprite Championship 01 (Birmingham Blues)
// to round out the top flight to 20.
// =====================================================================

const PREMIER_OVERRIDES: Record<string, SpriteOverride> = {
  capital_city:          { name: "Chelsea Borough",         shortName: "CHB", crestSprite: "crest-pr-07.png", city: "Chelsea" },
  royal_albion:          { name: "Woolwich Gunners",        shortName: "WGN", crestSprite: "crest-pr-01.png", city: "Woolwich" },
  northern_borough:      { name: "Newcastle Tyne",          shortName: "NTY", crestSprite: "crest-pr-14.png", city: "Newcastle" },
  westway_united:        { name: "West Ham Ironworks",      shortName: "WHI", crestSprite: "crest-pr-18.png", city: "East London" },
  dockside_reds:         { name: "Liverpool Mersey",        shortName: "LMY", crestSprite: "crest-pr-11.png", city: "Liverpool" },
  mersey_dockers:        { name: "Manchester Sky",          shortName: "MSK", crestSprite: "crest-pr-12.png", city: "Manchester" },
  yorkshire_united:      { name: "Leeds White Rose",        shortName: "LWR", crestSprite: "crest-pr-10.png", city: "Leeds" },
  leeds_borough:         { name: "Tottenham Cockerels",     shortName: "TOC", crestSprite: "crest-pr-17.png", city: "North London" },
  south_london_athletic: { name: "Mersust Eagles",          shortName: "MEA", crestSprite: "crest-pr-08.png", city: "South London" },
  brighton_pier_fc:      { name: "Brighton Seagates",       shortName: "BSG", crestSprite: "crest-pr-05.png", city: "Brighton" },
  oldcastle_united:      { name: "Burnmoor",                shortName: "BMO", crestSprite: "crest-pr-06.png", city: "Burnmoor" },
  sunderland_port:       { name: "Sunderland Wear",         shortName: "SWR", crestSprite: "crest-pr-16.png", city: "Sunderland" },
  midlands_town:         { name: "Aston Heath",             shortName: "AHE", crestSprite: "crest-pr-02.png", city: "Birmingham" },
  derby_foundry:         { name: "Manchester Red",          shortName: "MRD", crestSprite: "crest-pr-13.png", city: "Manchester" },
  coventry_motors:       { name: "Wolverhampton Wanderers", shortName: "WLV", crestSprite: "crest-pr-19.png", city: "Wolverhampton" },
  cardiff_harbour:       { name: "Brent Vale",              shortName: "BVA", crestSprite: "crest-pr-04.png", city: "Brent" },
  reading_royals:        { name: "Fulham Reach",            shortName: "FRH", crestSprite: "crest-pr-09.png", city: "Fulham" },
  manilva_town:          { name: "Dorset Cherries",         shortName: "DCH", crestSprite: "crest-pr-03.png", city: "Dorset" },
  oxford_scholars:       { name: "Nottingham Forestside",   shortName: "NFS", crestSprite: "crest-pr-15.png", city: "Nottingham" },
  lancashire_lions:      { name: "Birmingham Blues",        shortName: "BBL", crestSprite: "crest-ch-01.png", city: "Birmingham" },
};

// =====================================================================
// DIVISION ONE (20)
// Sprite Championship 02..21.
// =====================================================================

const DIVISION_ONE_OVERRIDES: Record<string, SpriteOverride> = {
  south_london_rovers:    { name: "Blackburn Rivers",      shortName: "BRV", crestSprite: "crest-ch-02.png", city: "Blackburn" },
  east_port_city:         { name: "Bristol Robins",        shortName: "BRO", crestSprite: "crest-ch-03.png", city: "Bristol" },
  south_coast_rovers:     { name: "Charlton Valley",       shortName: "CHV", crestSprite: "crest-ch-04.png", city: "Charlton" },
  plymouth_coast:         { name: "Coventry Motors",       shortName: "COV", crestSprite: "crest-ch-05.png", city: "Coventry" },
  sheffield_works:        { name: "Derby Rams",            shortName: "DBY", crestSprite: "crest-ch-06.png", city: "Derby" },
  bristol_vale:           { name: "Hull Dockers",          shortName: "HUL", crestSprite: "crest-ch-07.png", city: "Hull" },
  nottingham_forestside:  { name: "Ipswich Tractormen",    shortName: "IPS", crestSprite: "crest-ch-08.png", city: "Ipswich" },
  wigan_borough:          { name: "Leicester Foxes",       shortName: "LEF", crestSprite: "crest-ch-09.png", city: "Leicester" },
  exeter_cityside:        { name: "Middlesbrough Steel",   shortName: "MDB", crestSprite: "crest-ch-10.png", city: "Middlesbrough" },
  harbour_athletic:       { name: "Norwich Canaries",      shortName: "NOR", crestSprite: "crest-ch-11.png", city: "Norwich" },
  estepona_athletic:      { name: "Oxford Scholars",       shortName: "OXS", crestSprite: "crest-ch-12.png", city: "Oxford" },
  coastal_union:          { name: "Preston Lilies",        shortName: "PRL", crestSprite: "crest-ch-13.png", city: "Preston" },
  redbridge_town:         { name: "Portsmouth Navy",       shortName: "POR", crestSprite: "crest-ch-14.png", city: "Portsmouth" },
  northfield_fc:          { name: "Queen's Park Hoops",    shortName: "QPH", crestSprite: "crest-ch-15.png", city: "Queen's Park" },
  kingston_vale:          { name: "Sheffield Owls",        shortName: "SOW", crestSprite: "crest-ch-16.png", city: "Sheffield" },
  ironbridge_albion:      { name: "Sheffield Blades",      shortName: "SBL", crestSprite: "crest-ch-17.png", city: "Sheffield" },
  greenford_rovers:       { name: "Southampton Saints",    shortName: "SOU", crestSprite: "crest-ch-18.png", city: "Southampton" },
  ashfield_athletic:      { name: "Stoke Potters",         shortName: "STK", crestSprite: "crest-ch-19.png", city: "Stoke" },
  newhaven_town:          { name: "Swansea Swans",         shortName: "SWA", crestSprite: "crest-ch-20.png", city: "Swansea" },
  riverside_county:       { name: "Watford Hornets",       shortName: "WAT", crestSprite: "crest-ch-21.png", city: "Watford" },
};

// =====================================================================
// DIVISION TWO (20)
// Sprite Division 1 01..20.
// =====================================================================

const DIVISION_TWO_OVERRIDES: Record<string, SpriteOverride> = {
  aldermoor_fc:        { name: "Southwest Dons",        shortName: "SWD", crestSprite: "crest-d1-01.png", city: "Milton" },
  bramwell_borough:    { name: "Barnsley Tykes",        shortName: "BAR", crestSprite: "crest-d1-02.png", city: "Barnsley" },
  charnwood_town:      { name: "Blackpool Seasiders",   shortName: "BPL", crestSprite: "crest-d1-03.png", city: "Blackpool" },
  drayfield_united:    { name: "Bolton Whites",         shortName: "BOL", crestSprite: "crest-d1-04.png", city: "Bolton" },
  edenbridge_fc:       { name: "Bradford Bantams",      shortName: "BRD", crestSprite: "crest-d1-05.png", city: "Bradford" },
  foxhollow_town:      { name: "Burton Brewers",        shortName: "BUR", crestSprite: "crest-d1-06.png", city: "Burton" },
  greystone_athletic:  { name: "Cardiff Bluebirds",     shortName: "CDF", crestSprite: "crest-d1-07.png", city: "Cardiff" },
  hartwood_rangers:    { name: "Doncaster Rail",        shortName: "DON", crestSprite: "crest-d1-08.png", city: "Doncaster" },
  inverleigh_fc:       { name: "Exeter Romans",         shortName: "EXR", crestSprite: "crest-d1-09.png", city: "Exeter" },
  jasperton_united:    { name: "Huddersfield Terriers", shortName: "HUT", crestSprite: "crest-d1-10.png", city: "Huddersfield" },
  kingsford_athletic:  { name: "Leyton O's",            shortName: "LEY", crestSprite: "crest-d1-11.png", city: "Leyton" },
  lockwood_town:       { name: "Lincoln Imps",          shortName: "LIN", crestSprite: "crest-d1-12.png", city: "Lincoln" },
  marlborough_fc:      { name: "Luton Hatters",         shortName: "LUT", crestSprite: "crest-d1-13.png", city: "Luton" },
  norfolk_vale_united: { name: "Mansfield Stags",       shortName: "MNS", crestSprite: "crest-d1-14.png", city: "Mansfield" },
  oakridge_town:       { name: "Northampton Cobblers",  shortName: "NCO", crestSprite: "crest-d1-15.png", city: "Northampton" },
  penbridge_united:    { name: "Peterborough Prowlers", shortName: "PET", crestSprite: "crest-d1-16.png", city: "Peterborough" },
  quinford_rovers:     { name: "Plymouth Pilgrims",     shortName: "PLY", crestSprite: "crest-d1-17.png", city: "Plymouth" },
  rivermouth_fc:       { name: "Port Vale Valiants",    shortName: "PVL", crestSprite: "crest-d1-18.png", city: "Port Vale" },
  selwick_borough:     { name: "Reading Royals",        shortName: "REA", crestSprite: "crest-d1-19.png", city: "Reading" },
  thornbury_united:    { name: "Rotherham Millers",     shortName: "ROT", crestSprite: "crest-d1-20.png", city: "Rotherham" },
};

// =====================================================================
// DIVISION THREE (20)
// Sprite Division 2 01..20.
// =====================================================================

const DIVISION_THREE_OVERRIDES: Record<string, SpriteOverride> = {
  underbridge_fc:       { name: "Accrington Reds",      shortName: "ACC", crestSprite: "crest-d2-01.png", city: "Accrington" },
  velmore_town:         { name: "Barrow Bluebirds",     shortName: "BRW", crestSprite: "crest-d2-02.png", city: "Barrow" },
  wexham_united:        { name: "Barnet Bees",          shortName: "BNT", crestSprite: "crest-d2-03.png", city: "Barnet" },
  yarmouth_vale:        { name: "Bromley Ravens",       shortName: "BRM", crestSprite: "crest-d2-04.png", city: "Bromley" },
  allerton_athletic:    { name: "Cambridge Scholars",   shortName: "CAM", crestSprite: "crest-d2-05.png", city: "Cambridge" },
  belford_rangers:      { name: "Cheltenham Robins",    shortName: "CHT", crestSprite: "crest-d2-06.png", city: "Cheltenham" },
  cotsworth_borough:    { name: "Chesterfield Spires",  shortName: "CHE", crestSprite: "crest-d2-07.png", city: "Chesterfield" },
  daleford_town:        { name: "Colchester Eagles",    shortName: "COL", crestSprite: "crest-d2-08.png", city: "Colchester" },
  easterley_united:     { name: "Crewe Railway",        shortName: "CRW", crestSprite: "crest-d2-09.png", city: "Crewe" },
  falkbridge_athletic:  { name: "Fleetwood Fishermen",  shortName: "FLE", crestSprite: "crest-d2-10.png", city: "Fleetwood" },
  greenholm_borough:    { name: "Gillingham Gills",     shortName: "GIL", crestSprite: "crest-d2-11.png", city: "Gillingham" },
  hartlebury_fc:        { name: "Grimsby Mariners",     shortName: "GRM", crestSprite: "crest-d2-12.png", city: "Grimsby" },
  iverside_town:        { name: "Harrogate Sulphur",    shortName: "HRG", crestSprite: "crest-d2-13.png", city: "Harrogate" },
  joppa_rangers:        { name: "Milton Keys",          shortName: "MKY", crestSprite: "crest-d2-14.png", city: "Milton Keys" },
  kelsworth_united:     { name: "Morecambe Shrimps",    shortName: "MOR", crestSprite: "crest-d2-15.png", city: "Morecambe" },
  lythorpe_athletic:    { name: "Newport Exiles",       shortName: "NWP", crestSprite: "crest-d2-16.png", city: "Newport" },
  maybridge_town:       { name: "Notts Magpies",        shortName: "NTM", crestSprite: "crest-d2-17.png", city: "Nottingham" },
  newcoate_fc:          { name: "Oldham Latics",        shortName: "OLA", crestSprite: "crest-d2-18.png", city: "Oldham" },
  otterford_town:       { name: "Salford Ammies",       shortName: "SAL", crestSprite: "crest-d2-19.png", city: "Salford" },
  penshire_athletic:    { name: "Shrewsbury Salop",     shortName: "SHR", crestSprite: "crest-d2-20.png", city: "Shrewsbury" },
};

const ALL_OVERRIDES: Record<string, SpriteOverride> = {
  ...PREMIER_OVERRIDES,
  ...DIVISION_ONE_OVERRIDES,
  ...DIVISION_TWO_OVERRIDES,
  ...DIVISION_THREE_OVERRIDES,
};

/** Look up the sprite override for a seed id, or null when unmapped. */
export function spriteOverrideFor(seedId: string): SpriteOverride | null {
  return ALL_OVERRIDES[seedId] ?? null;
}
