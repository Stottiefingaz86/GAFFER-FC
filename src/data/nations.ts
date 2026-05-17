// =====================================================================
// NATIONS — the European football pyramid registry.
//
// Each nation has its own four-tier league pyramid + domestic cup +
// league cup + super cup. The continental Champions Cup and
// Continental Cup are SHARED across all nations and pull qualifiers
// from each nation's top divisions every season.
//
// Adding a new nation in the future is purely additive: add an entry
// here and (optionally) hand-craft seeds in `src/data/clubSeeds/`.
// All competition ids are generated from `idPrefix` so nothing else
// in the codebase needs to know the list of nations explicitly.
// =====================================================================

import type { Nation, NationRegion } from "@/types/game";

export const NATION_IDS = {
  ENGLAND:    "england",
  ITALY:      "italy",
  SPAIN:      "spain",
  GERMANY:    "germany",
  SCOTLAND:   "scotland",
  FRANCE:     "france",
  NETHERLANDS:"netherlands",
  PORTUGAL:   "portugal",
  TURKEY:     "turkey",
  SWEDEN:     "sweden",
  POLAND:     "poland",
  BELGIUM:    "belgium",
  GREECE:     "greece",
  NORWAY:     "norway",
  DENMARK:    "denmark",
  CZECH:      "czech",
  UKRAINE:    "ukraine",
} as const;

export type NationId = (typeof NATION_IDS)[keyof typeof NATION_IDS];

// =====================================================================
// REGIONS — used by UI for grouping / filtering once the world has
// >5 nations. Order = display order in pickers.
// =====================================================================
export const REGIONS: ReadonlyArray<{
  id: NationRegion;
  label: string;
  shortLabel: string;
}> = [
  { id: "british-isles", label: "British Isles",   shortLabel: "British"  },
  { id: "western",       label: "Western Europe",  shortLabel: "Western"  },
  { id: "central",       label: "Central Europe",  shortLabel: "Central"  },
  { id: "southern",      label: "Southern Europe", shortLabel: "Southern" },
  { id: "northern",      label: "Northern Europe", shortLabel: "Northern" },
  { id: "eastern",       label: "Eastern Europe",  shortLabel: "Eastern"  },
];

/** Master nation registry. Order is the order they appear in the
 *  career-start nation picker (within each region group). England is
 *  first because the existing hand-crafted seeds are English; every
 *  other nation uses procedural seeds keyed off `idPrefix`. */
export const NATIONS: Nation[] = [
  // ── BRITISH ISLES ─────────────────────────────────────────────────
  {
    id: NATION_IDS.ENGLAND,
    name: "England",
    shortName: "ENG",
    region: "british-isles",
    flagColors: ["#FFFFFF", "#CE1124"],
    flagOrientation: "cross-st-george",
    idPrefix: "eng",
    /** Default division IDs use the historical un-prefixed names so
     *  existing English saves continue to load without migration. */
    divisionIds: ["div_premier", "div_one", "div_two", "div_three"],
    divisionNames: ["Premier Division", "Division One", "Division Two", "Division Three"],
    divisionShortNames: ["PREM", "D1", "D2", "D3"],
    nationalCupId: "national_cup",
    nationalCupName: "National Cup",
    nationalCupShortName: "NCUP",
    leagueCupId: "league_cup",
    leagueCupName: "League Cup",
    leagueCupShortName: "LCUP",
    superCupId: "super_shield",
    superCupName: "Super Shield",
    superCupShortName: "SHLD",
    nameNationalityId: "ALB",
  },
  {
    id: NATION_IDS.SCOTLAND,
    name: "Scotland",
    shortName: "SCO",
    region: "british-isles",
    flagColors: ["#0065BD", "#FFFFFF"],
    flagOrientation: "saltire",
    idPrefix: "sco",
    divisionIds: ["sco_premiership", "sco_championship", "sco_league_one", "sco_league_two"],
    divisionNames: ["Scottish Premiership", "Scottish Championship", "Scottish League One", "Scottish League Two"],
    divisionShortNames: ["SPL", "SCH", "SL1", "SL2"],
    nationalCupId: "sco_cup",
    nationalCupName: "Scottish Cup",
    nationalCupShortName: "SCUP",
    leagueCupId: "sco_league_cup",
    leagueCupName: "Scottish League Cup",
    leagueCupShortName: "SLCP",
    superCupId: "sco_super",
    superCupName: "Scottish Super Cup",
    superCupShortName: "SSCP",
    nameNationalityId: "ALB",
  },

  // ── WESTERN EUROPE ────────────────────────────────────────────────
  {
    id: NATION_IDS.FRANCE,
    name: "France",
    shortName: "FRA",
    region: "western",
    flagColors: ["#0055A4", "#FFFFFF", "#EF4135"],
    flagOrientation: "tricolore-vertical",
    idPrefix: "fra",
    divisionIds: ["fra_ligue_1", "fra_ligue_2", "fra_national", "fra_national_2"],
    divisionNames: ["Ligue 1", "Ligue 2", "National", "National 2"],
    divisionShortNames: ["L1", "L2", "NAT", "N2"],
    nationalCupId: "fra_coupe",
    nationalCupName: "Coupe de France",
    nationalCupShortName: "CDF",
    leagueCupId: "fra_coupe_ligue",
    leagueCupName: "Coupe de la Ligue",
    leagueCupShortName: "CDL",
    superCupId: "fra_trophee",
    superCupName: "Trophée des Champions",
    superCupShortName: "TDC",
    nameNationalityId: "GAL",
  },
  {
    id: NATION_IDS.NETHERLANDS,
    name: "Netherlands",
    shortName: "NED",
    region: "western",
    flagColors: ["#AE1C28", "#FFFFFF", "#21468B"],
    flagOrientation: "tricolore-horizontal",
    idPrefix: "ned",
    divisionIds: ["ned_eredivisie", "ned_eerste", "ned_tweede", "ned_derde"],
    divisionNames: ["Eredivisie", "Eerste Divisie", "Tweede Divisie", "Derde Divisie"],
    divisionShortNames: ["ERED", "1DIV", "2DIV", "3DIV"],
    nationalCupId: "ned_beker",
    nationalCupName: "KNVB Beker",
    nationalCupShortName: "BKR",
    leagueCupId: "ned_supercup",
    leagueCupName: "Eredivisie Cup",
    leagueCupShortName: "ERC",
    superCupId: "ned_johan",
    superCupName: "Johan Cruyff Schaal",
    superCupShortName: "JCS",
    nameNationalityId: "NLD",
  },
  {
    id: NATION_IDS.BELGIUM,
    name: "Belgium",
    shortName: "BEL",
    region: "western",
    flagColors: ["#000000", "#FAE042", "#ED2939"],
    flagOrientation: "tricolore-vertical",
    idPrefix: "bel",
    divisionIds: ["bel_pro_league", "bel_challenger", "bel_premiere", "bel_deuxieme"],
    divisionNames: ["Pro League", "Challenger Pro", "Eerste Klasse", "Tweede Klasse"],
    divisionShortNames: ["PROL", "CHAL", "EK", "TK"],
    nationalCupId: "bel_beker",
    nationalCupName: "Beker van België",
    nationalCupShortName: "BVB",
    leagueCupId: "bel_liga",
    leagueCupName: "Belgian League Cup",
    leagueCupShortName: "BLC",
    superCupId: "bel_super",
    superCupName: "Belgische Supercup",
    superCupShortName: "BSC",
    nameNationalityId: "NLD",
  },

  // ── CENTRAL EUROPE ────────────────────────────────────────────────
  {
    id: NATION_IDS.GERMANY,
    name: "Germany",
    shortName: "GER",
    region: "central",
    flagColors: ["#000000", "#DD0000", "#FFCE00"],
    flagOrientation: "tricolore-horizontal",
    idPrefix: "ger",
    divisionIds: ["ger_bundesliga", "ger_2_bundesliga", "ger_3_liga", "ger_regionalliga"],
    divisionNames: ["Bundesliga", "2. Bundesliga", "3. Liga", "Regionalliga"],
    divisionShortNames: ["BUND", "2BL", "3L", "REG"],
    nationalCupId: "ger_pokal",
    nationalCupName: "Deutsche Pokal",
    nationalCupShortName: "DPK",
    leagueCupId: "ger_liga_pokal",
    leagueCupName: "Liga-Pokal",
    leagueCupShortName: "LPK",
    superCupId: "ger_supercup",
    superCupName: "DFL-Supercup",
    superCupShortName: "DFLS",
    nameNationalityId: "GRM",
  },
  {
    id: NATION_IDS.CZECH,
    name: "Czech Republic",
    shortName: "CZE",
    region: "central",
    flagColors: ["#FFFFFF", "#D7141A", "#11457E"],
    flagOrientation: "tricolore-horizontal",
    idPrefix: "cze",
    divisionIds: ["cze_chance_liga", "cze_fnl", "cze_cfl", "cze_divize"],
    divisionNames: ["Chance Liga", "Fortuna Národní Liga", "ČFL", "Divize"],
    divisionShortNames: ["CHL", "FNL", "ČFL", "DIV"],
    nationalCupId: "cze_pohar",
    nationalCupName: "Český Pohár",
    nationalCupShortName: "ČPC",
    leagueCupId: "cze_liga_pohar",
    leagueCupName: "Czech League Cup",
    leagueCupShortName: "CLC",
    superCupId: "cze_super",
    superCupName: "Český Superpohár",
    superCupShortName: "ČSP",
    nameNationalityId: "EAS",
  },

  // ── SOUTHERN EUROPE ───────────────────────────────────────────────
  {
    id: NATION_IDS.ITALY,
    name: "Italy",
    shortName: "ITA",
    region: "southern",
    flagColors: ["#009246", "#FFFFFF", "#CE2B37"],
    flagOrientation: "tricolore-vertical",
    idPrefix: "ita",
    divisionIds: ["ita_serie_a", "ita_serie_b", "ita_serie_c", "ita_serie_d"],
    divisionNames: ["Serie A", "Serie B", "Serie C", "Serie D"],
    divisionShortNames: ["SERA", "SERB", "SERC", "SERD"],
    nationalCupId: "ita_coppa",
    nationalCupName: "Coppa Italiana",
    nationalCupShortName: "CITA",
    leagueCupId: "ita_supercoppa_l",
    leagueCupName: "Coppa di Lega",
    leagueCupShortName: "CDL",
    superCupId: "ita_supercoppa",
    superCupName: "Supercoppa",
    superCupShortName: "SCIT",
    nameNationalityId: "ITL",
  },
  {
    id: NATION_IDS.SPAIN,
    name: "Spain",
    shortName: "ESP",
    region: "southern",
    flagColors: ["#AA151B", "#F1BF00", "#AA151B"],
    flagOrientation: "tricolore-horizontal",
    idPrefix: "esp",
    divisionIds: ["esp_la_liga", "esp_segunda", "esp_primera_rfef", "esp_segunda_rfef"],
    divisionNames: ["La Liga", "Segunda División", "Primera RFEF", "Segunda RFEF"],
    divisionShortNames: ["LIGA", "SEG", "PRFEF", "SRFEF"],
    nationalCupId: "esp_copa",
    nationalCupName: "Copa Iberica",
    nationalCupShortName: "COPA",
    leagueCupId: "esp_copa_liga",
    leagueCupName: "Copa de la Liga",
    leagueCupShortName: "CDLG",
    superCupId: "esp_supercopa",
    superCupName: "Supercopa",
    superCupShortName: "SCES",
    nameNationalityId: "IBR",
  },
  {
    id: NATION_IDS.PORTUGAL,
    name: "Portugal",
    shortName: "POR",
    region: "southern",
    flagColors: ["#006600", "#FF0000"],
    flagOrientation: "stripes-vertical",
    idPrefix: "por",
    divisionIds: ["por_primeira", "por_liga2", "por_liga3", "por_distrital"],
    divisionNames: ["Primeira Liga", "Liga Portugal 2", "Liga 3", "Campeonato Distrital"],
    divisionShortNames: ["LIG1", "LIG2", "LIG3", "DIST"],
    nationalCupId: "por_taca",
    nationalCupName: "Taça de Portugal",
    nationalCupShortName: "TPT",
    leagueCupId: "por_taca_liga",
    leagueCupName: "Taça da Liga",
    leagueCupShortName: "TDL",
    superCupId: "por_supertaca",
    superCupName: "Supertaça",
    superCupShortName: "STP",
    nameNationalityId: "IBR",
  },
  {
    id: NATION_IDS.GREECE,
    name: "Greece",
    shortName: "GRE",
    region: "southern",
    flagColors: ["#0D5EAF", "#FFFFFF"],
    flagOrientation: "stripes-horizontal",
    idPrefix: "gre",
    divisionIds: ["gre_super_league", "gre_super_2", "gre_gamma", "gre_delta"],
    divisionNames: ["Super League", "Super League 2", "Gamma Ethniki", "Delta Ethniki"],
    divisionShortNames: ["SUP1", "SUP2", "GAM", "DEL"],
    nationalCupId: "gre_kypello",
    nationalCupName: "Kypello Ellados",
    nationalCupShortName: "KE",
    leagueCupId: "gre_liga_cup",
    leagueCupName: "Greek League Cup",
    leagueCupShortName: "GLC",
    superCupId: "gre_super",
    superCupName: "Greek Super Cup",
    superCupShortName: "GSC",
    nameNationalityId: "EAS",
  },
  {
    id: NATION_IDS.TURKEY,
    name: "Turkey",
    shortName: "TUR",
    region: "southern",
    flagColors: ["#E30A17", "#FFFFFF"],
    flagOrientation: "solid",
    idPrefix: "tur",
    divisionIds: ["tur_super_lig", "tur_1_lig", "tur_2_lig", "tur_3_lig"],
    divisionNames: ["Süper Lig", "1. Lig", "2. Lig", "3. Lig"],
    divisionShortNames: ["SUP", "1L", "2L", "3L"],
    nationalCupId: "tur_kupa",
    nationalCupName: "Türkiye Kupası",
    nationalCupShortName: "TK",
    leagueCupId: "tur_liga_kupa",
    leagueCupName: "Lig Kupası",
    leagueCupShortName: "LK",
    superCupId: "tur_super",
    superCupName: "TFF Süper Kupa",
    superCupShortName: "TSK",
    nameNationalityId: "EAS",
  },

  // ── NORTHERN EUROPE ───────────────────────────────────────────────
  {
    id: NATION_IDS.SWEDEN,
    name: "Sweden",
    shortName: "SWE",
    region: "northern",
    flagColors: ["#006AA7", "#FECC00"],
    flagOrientation: "nordic-cross",
    idPrefix: "swe",
    divisionIds: ["swe_allsvenskan", "swe_superettan", "swe_ettan", "swe_tvaan"],
    divisionNames: ["Allsvenskan", "Superettan", "Ettan", "Tvåan"],
    divisionShortNames: ["ALSV", "SUP1", "ETT", "TVÅ"],
    nationalCupId: "swe_cupen",
    nationalCupName: "Svenska Cupen",
    nationalCupShortName: "SVC",
    leagueCupId: "swe_liga",
    leagueCupName: "Allsvenska Cupen",
    leagueCupShortName: "AC",
    superCupId: "swe_super",
    superCupName: "Svenska Supercupen",
    superCupShortName: "SSC",
    nameNationalityId: "SCN",
  },
  {
    id: NATION_IDS.NORWAY,
    name: "Norway",
    shortName: "NOR",
    region: "northern",
    flagColors: ["#EF2B2D", "#FFFFFF", "#002868"],
    flagOrientation: "nordic-cross",
    idPrefix: "nor",
    divisionIds: ["nor_eliteserien", "nor_obos", "nor_postnord", "nor_norsk_4"],
    divisionNames: ["Eliteserien", "OBOS-ligaen", "PostNord-ligaen", "Norsk 4. divisjon"],
    divisionShortNames: ["ELT", "OBOS", "PNL", "N4"],
    nationalCupId: "nor_cupen",
    nationalCupName: "Norgesmesterskapet",
    nationalCupShortName: "NCM",
    leagueCupId: "nor_liga",
    leagueCupName: "Eliteserien Cup",
    leagueCupShortName: "EC",
    superCupId: "nor_super",
    superCupName: "Mesterfinalen",
    superCupShortName: "MF",
    nameNationalityId: "SCN",
  },
  {
    id: NATION_IDS.DENMARK,
    name: "Denmark",
    shortName: "DEN",
    region: "northern",
    flagColors: ["#C8102E", "#FFFFFF"],
    flagOrientation: "nordic-cross",
    idPrefix: "den",
    divisionIds: ["den_superliga", "den_1_division", "den_2_division", "den_3_division"],
    divisionNames: ["Superliga", "1. Division", "2. Division", "3. Division"],
    divisionShortNames: ["SLG", "1DIV", "2DIV", "3DIV"],
    nationalCupId: "den_pokal",
    nationalCupName: "DBU Pokalen",
    nationalCupShortName: "DBP",
    leagueCupId: "den_liga",
    leagueCupName: "Danish League Cup",
    leagueCupShortName: "DLC",
    superCupId: "den_super",
    superCupName: "Super Cup",
    superCupShortName: "SC",
    nameNationalityId: "SCN",
  },

  // ── EASTERN EUROPE ────────────────────────────────────────────────
  {
    id: NATION_IDS.POLAND,
    name: "Poland",
    shortName: "POL",
    region: "eastern",
    flagColors: ["#FFFFFF", "#DC143C"],
    flagOrientation: "stripes-horizontal",
    idPrefix: "pol",
    divisionIds: ["pol_ekstraklasa", "pol_i_liga", "pol_ii_liga", "pol_iii_liga"],
    divisionNames: ["Ekstraklasa", "I Liga", "II Liga", "III Liga"],
    divisionShortNames: ["EKS", "1LG", "2LG", "3LG"],
    nationalCupId: "pol_puchar",
    nationalCupName: "Puchar Polski",
    nationalCupShortName: "PP",
    leagueCupId: "pol_liga",
    leagueCupName: "Puchar Ligi",
    leagueCupShortName: "PL",
    superCupId: "pol_super",
    superCupName: "Superpuchar",
    superCupShortName: "SUP",
    nameNationalityId: "EAS",
  },
  {
    id: NATION_IDS.UKRAINE,
    name: "Ukraine",
    shortName: "UKR",
    region: "eastern",
    flagColors: ["#005BBB", "#FFD500"],
    flagOrientation: "stripes-horizontal",
    idPrefix: "ukr",
    divisionIds: ["ukr_premier", "ukr_persha", "ukr_druha", "ukr_amatorska"],
    divisionNames: ["Premier League", "Persha Liha", "Druha Liha", "Amators'ka Liha"],
    divisionShortNames: ["UPL", "1LH", "2LH", "AML"],
    nationalCupId: "ukr_kubok",
    nationalCupName: "Kubok Ukrainy",
    nationalCupShortName: "KU",
    leagueCupId: "ukr_liga",
    leagueCupName: "Ukrainian League Cup",
    leagueCupShortName: "ULC",
    superCupId: "ukr_super",
    superCupName: "Superkubok",
    superCupShortName: "SK",
    nameNationalityId: "EAS",
  },
];

/** Quick-lookup map by id. Lazily computed once. */
export const NATIONS_BY_ID: Record<string, Nation> = Object.fromEntries(
  NATIONS.map((n) => [n.id, n]),
);

/** All nation ids in registry order. */
export const ALL_NATION_IDS: string[] = NATIONS.map((n) => n.id);

// =====================================================================
// Helpers — derive competition ids without hard-coding strings.
// =====================================================================

export function nationFor(nationId: string): Nation {
  const n = NATIONS_BY_ID[nationId];
  if (!n) throw new Error(`Unknown nation id: ${nationId}`);
  return n;
}

export function divisionIdFor(nationId: string, tier: 1 | 2 | 3 | 4): string {
  return nationFor(nationId).divisionIds[tier - 1];
}

export function divisionNameFor(nationId: string, tier: 1 | 2 | 3 | 4): string {
  return nationFor(nationId).divisionNames[tier - 1];
}

export function divisionShortNameFor(nationId: string, tier: 1 | 2 | 3 | 4): string {
  return nationFor(nationId).divisionShortNames[tier - 1];
}

export function nationalCupIdFor(nationId: string): string {
  return nationFor(nationId).nationalCupId;
}

export function leagueCupIdFor(nationId: string): string {
  return nationFor(nationId).leagueCupId;
}

export function superCupIdFor(nationId: string): string {
  return nationFor(nationId).superCupId;
}

/** Returns the tier (1..4) of a division id within its nation, or null
 *  if the id isn't a known league. */
export function divisionTierFor(divisionId: string): { nationId: string; tier: 1 | 2 | 3 | 4 } | null {
  for (const n of NATIONS) {
    const idx = n.divisionIds.indexOf(divisionId);
    if (idx >= 0) return { nationId: n.id, tier: (idx + 1) as 1 | 2 | 3 | 4 };
  }
  return null;
}

/** Returns the nation that owns a given competition id (league or
 *  cup). Used by UI to show flags / nation context next to fixtures. */
export function nationOfCompetition(competitionId: string): Nation | null {
  for (const n of NATIONS) {
    if (n.divisionIds.includes(competitionId)) return n;
    if (n.nationalCupId === competitionId) return n;
    if (n.leagueCupId === competitionId) return n;
    if (n.superCupId === competitionId) return n;
  }
  return null;
}

/** Whether a competition id refers to a domestic league (any nation,
 *  any tier). Used to discriminate league vs cup fixtures across the
 *  app — replaces the old `startsWith("div_")` check that was only
 *  correct for English saves. */
export function isLeagueCompetitionId(competitionId: string): boolean {
  return divisionTierFor(competitionId) !== null;
}

/** All nations grouped by region (in REGIONS order). Used by UI to
 *  render region-grouped pickers. */
export function nationsByRegion(): Array<{
  region: NationRegion;
  label: string;
  shortLabel: string;
  nations: Nation[];
}> {
  return REGIONS.map((r) => ({
    region: r.id,
    label: r.label,
    shortLabel: r.shortLabel,
    nations: NATIONS.filter((n) => n.region === r.id),
  })).filter((r) => r.nations.length > 0);
}
