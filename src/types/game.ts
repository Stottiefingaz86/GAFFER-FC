// =====================================================================
// CORE GAME TYPES — Gaffer FC
// All types are intentionally permissive enough to support future phases
// (transfers, upgrades, training, multiplayer) while powering Phase 1.
// =====================================================================

export type Position = "GK" | "DEF" | "MID" | "FWD";
export type DetailedPosition =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "DM"
  | "CM"
  | "AM"
  | "LM"
  | "RM"
  | "LW"
  | "RW"
  | "ST"
  | "CF";

export type PreferredFoot = "Left" | "Right" | "Both";

export type PlayStyle =
  | "Balanced"
  | "Attacking"
  | "Defensive"
  | "Counter"
  | "High Press"
  | "Possession"
  | "Direct"
  | "Physical"
  | "Youth Focus"
  | "Set Pieces";

export type Tactic =
  | "Balanced"
  | "Attacking"
  | "Defensive"
  | "Counter"
  | "High Press"
  | "Possession"
  | "Direct"
  | "Long Ball"
  // Style-led variants — each compresses a specific philosophy into
  // distinct attack/defence/press deltas (see matchEngine TACTIC_MOD).
  | "Tiki-Taka"
  | "Gegenpress"
  | "Wing Play"
  | "Park the Bus";

export type FormationKey =
  | "4-4-2"
  | "4-3-3"
  | "3-5-2"
  | "4-2-3-1"
  | "5-3-2"
  | "4-5-1"
  // Extra shapes for managers who want something a bit different
  | "4-1-4-1"      // anchor + flat 4 + lone striker
  | "3-4-3"        // wing-backs and front three
  | "4-1-2-1-2"    // narrow midfield diamond
  | "5-4-1"        // ultra-defensive shell
  | "4-4-1-1";     // second striker tucked behind a lone forward

export type ClubPersonality =
  | "Sleeping Giant"
  | "Local Underdog"
  | "Big City Club"
  | "Historic Club"
  | "Youth Factory"
  | "Money Club"
  | "Fan-Owned Club"
  | "Crisis Club"
  | "Promotion Hunter"
  | "Cup Fighter"
  | "Fallen Giant"
  | "Coastal Club"
  | "Industrial Club"
  | "University Club"
  | "Port Club"
  | "Mining Town Club"
  | "Railway Club"
  | "Working-Class Club"
  | "Flashy New Club"
  | "Academy Club";

export type PlayerTrait =
  | "Big Game Player"
  | "Injury Prone"
  | "Leader"
  | "Hot Head"
  | "Super Sub"
  | "Wonderkid"
  | "Penalty Specialist"
  | "Long Shot Taker"
  | "Composed Finisher"
  | "Cult Hero"
  | "Loyal"
  | "Mercenary"
  | "Fan Favourite"
  | "Derby Specialist"
  | "Late Bloomer"
  | "Set Piece Expert"
  | "Engine"
  | "Brick Wall"
  | "Playmaker"
  | "Speedster"
  | "Target Man"
  | "Clutch Keeper"
  | "Cup Specialist"
  | "One Club Man";

export type Personality =
  | "Professional"
  | "Ambitious"
  | "Loyal"
  | "Temperamental"
  | "Relaxed"
  | "Leader"
  | "Inconsistent"
  | "Confident"
  | "Nervous"
  | "Driven"
  | "Money Motivated"
  | "Big Match Mentality"
  | "Homegrown Hero";

export type BadgeShape = "shield" | "circle" | "diamond" | "crest" | "oval";
export type BadgeIcon =
  | "lion"
  | "anchor"
  | "tower"
  | "star"
  | "wave"
  | "crown"
  | "eagle"
  | "wheel"
  | "dragon"
  | "horse"
  | "castle"
  | "flame"
  | "bridge"
  | "rose"
  | "mountain"
  | "sun"
  | "bolt"
  | "stag"
  | "falcon"
  | "hammer"
  | "tree"
  | "river"
  | "sword";

export type BadgePattern =
  | "plain"
  | "stripes"
  | "hoops"
  | "diagonal"
  | "halves"
  | "quarters"
  | "chevron";

export interface Badge {
  shape: BadgeShape;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  icon: BadgeIcon;
  initials: string;
  foundingYear: number;
  pattern: BadgePattern;
  customImageDataUrl?: string;
}

export type KitPattern =
  | "plain"
  | "vertical-stripes"
  | "hoops"
  | "sash"
  | "halves"
  | "diagonal"
  | "sleeves"
  | "pinstripes"
  | "checker";

export interface Kit {
  primaryColor: string;
  secondaryColor: string;
  shortsColor: string;
  socksColor: string;
  pattern: KitPattern;
  sponsorText: string;
}

export interface Stadium {
  id: string;
  name: string;
  capacity: number;
  level: number;
  condition: number;
  atmosphere: number;
  hospitalityLevel: number;
  fanZoneLevel: number;
  pitchQualityLevel: number;
}

export interface Facilities {
  trainingGround: number;
  youthAcademy: number;
  medicalCentre: number;
  scoutingNetwork: number;
  clubShop: number;
  sponsorshipOffice: number;
  mediaRoom: number;
  communityProgram: number;
}

export interface Objective {
  id: string;
  type: "season" | "weekly";
  text: string;
  reward: string;
  done: boolean;
}

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  age: number;
  dateOfBirth: string;
  nationality: string;
  position: Position;
  detailedPosition: DetailedPosition;
  secondaryPositions: DetailedPosition[];
  preferredFoot: PreferredFoot;
  height: number;

  overall: number;
  potential: number;

  pace: number;
  shooting: number;
  passing: number;
  tackling: number;
  stamina: number;
  goalkeeping: number;
  technique: number;
  strength: number;
  mentality: number;

  form: number;
  morale: number;
  fitness: number;

  value: number;
  wage: number;
  contractYears: number;

  personality: Personality;
  trait: PlayerTrait;

  isInjured: boolean;
  injuryWeeks: number;
  isSuspended: boolean;
  suspensionMatches: number;

  goals: number;
  assists: number;
  appearances: number;
  yellowCards: number;
  redCards: number;
  averageRating: number;
  history: SeasonStat[];

  /** International caps (national team appearances). */
  caps: number;
  /** International goals. */
  internationalGoals: number;

  /** Snapshot of attributes taken periodically so the UI can render
   * up/down arrows beside each attribute. Optional — older saves may
   * not have one. */
  lastSnapshot?: PlayerAttributeSnapshot;

  /** Other clubs sniffing around. Generated on creation; updated when
   * form/age/value shifts make a player more or less attractive. */
  transferInterest: TransferInterest[];
}

/** Periodic snapshot of a player's headline numbers. The current values
 * are compared against this to compute up/down trend arrows.
 * Captured every 4 weeks of game time. */
export interface PlayerAttributeSnapshot {
  capturedWeek: number;
  overall: number;
  pace: number;
  shooting: number;
  passing: number;
  tackling: number;
  stamina: number;
  goalkeeping: number;
  technique: number;
  strength: number;
  mentality: number;
}

export type TransferInterestLevel = "rumour" | "watching" | "interested" | "bid";

export interface TransferInterest {
  clubId: string;
  level: TransferInterestLevel;
  /** Career week when the interest first appeared. */
  since: number;
}

export interface SeasonStat {
  season: number;
  clubId: string;
  competitionId: string;
  appearances: number;
  goals: number;
  assists: number;
  averageRating: number;
}

export type RoleArchetype =
  | "Star"
  /** Young phenom — already ranked alongside the top players in the
   * division at age 20-24, with a higher ceiling still to come. Models
   * the Mbappés, Bellinghams, and Yamals so there's always a young
   * face among the world's best, not just veteran stars. */
  | "RisingStar"
  | "YoungProspect"
  | "VeteranLeader"
  | "FanFavourite"
  | "InconsistentTalent"
  | "BackupKeeper"
  | "InjuryProne"
  | "HighPotentialYouth"
  | "Standard";

export interface Club {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  divisionId: string;
  badge: Badge;
  homeKit: Kit;
  awayKit: Kit;
  stadium: Stadium;
  budget: number;
  wageBudget: number;
  reputation: number;
  squadRating: number;
  attackRating: number;
  midfieldRating: number;
  defenceRating: number;
  goalkeeperRating: number;
  youthAcademyRating: number;
  boardPatience: number;
  fanbaseSize: number;
  fanMood: number;
  boardConfidence: number;
  rivalClubId: string | null;
  playStyle: PlayStyle;
  personality: ClubPersonality;
  facilities: Facilities;
  seasonObjectives: string[];
  weeklyObjectives: string[];
  /** Year the club was founded — used for "Established YYYY" copy and to
   * proportion procedural legacy trophies. */
  foundedYear?: number;
  /** Permanent record of trophies and season finishes. Optional so
   * older saves keep working — readers should treat missing as empty. */
  history?: ClubHistory;
  /** Filename of a hand-drawn crest sprite (under `/public/badges/`).
   * When set, UI prefers this over the procedural <Badge />. Optional so
   * legacy saves and any unmapped clubs keep their procedural badge. */
  crestSprite?: string;
}

// =====================================================================
// CLUB HISTORY — trophy cabinet + season-by-season finishes
// =====================================================================

/** A single piece of silverware. `position` is 1 for winners, 2 for
 * runners-up, 3 for third (league only). For knockouts only 1/2 occur. */
export interface Trophy {
  /** competitionId from COMP_IDS / DIVISION_NAMES. */
  competitionId: string;
  /** Season number — matches Career.season. */
  season: number;
  /** 1 = winner, 2 = runner-up, 3 = third (league only). */
  position: 1 | 2 | 3;
}

/** End-of-season snapshot of a club's league record. */
export interface ClubSeasonRecord {
  season: number;
  divisionId: string;
  finalPosition: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface ClubHistory {
  trophies: Trophy[];
  seasons: ClubSeasonRecord[];
}

// =====================================================================
// COMPETITIONS
// =====================================================================

export type CompetitionType =
  | "League"
  | "DomesticCup"
  | "LeagueCup"
  | "ContinentalCup"
  | "SuperCup";

export type CompetitionFormat = "League" | "Knockout" | "GroupAndKnockout";

export interface Competition {
  id: string;
  name: string;
  shortName: string;
  type: CompetitionType;
  format: CompetitionFormat;
  divisionTier?: 1 | 2 | 3 | 4;
  teamIds: string[];
  qualification?: QualificationRule[];
}

export interface QualificationRule {
  fromCompetitionId: string;
  fromPosition?: number;
  toCompetitionId: string;
  description: string;
}

// =====================================================================
// FIXTURES, RESULTS, TABLES
// =====================================================================

/** Day of the football week. Leagues are typically FRI/SAT/SUN, cup ties
 * are TUE/WED midweek. Used to group results in the round-up screen. */
export type MatchDay = "FRI" | "SAT" | "SUN" | "TUE" | "WED";

export const MATCHDAY_ORDER: MatchDay[] = ["FRI", "SAT", "SUN", "TUE", "WED"];

export const MATCHDAY_LABEL: Record<MatchDay, string> = {
  FRI: "Friday Night",
  SAT: "Saturday",
  SUN: "Sunday",
  TUE: "Tuesday",
  WED: "Wednesday",
};

export interface Fixture {
  id: string;
  competitionId: string;
  round: number;
  week: number;
  /** Optional kickoff day. Older saves may omit it; readers should
   * treat missing values as "SAT" for league and "WED" for cups. */
  dayOfWeek?: MatchDay;
  homeId: string;
  awayId: string;
  played: boolean;
  result?: MatchResult;
  stage?: string;
}

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "home" | "away";
  playerId?: string;
  playerName?: string;
  text: string;
  /** Only set on Substitution events — the player coming off. */
  subOffPlayerId?: string;
  /** Only set on Substitution events — display name for the player coming off. */
  subOffPlayerName?: string;
}

export type MatchEventType =
  | "Goal"
  | "Chance"
  | "BigChance"
  | "ShotWide"
  | "ShotSaved"
  | "Penalty"
  | "PenaltyScored"
  | "PenaltyMissed"
  | "Yellow"
  | "Red"
  | "Injury"
  | "KeeperSave"
  | "KeeperMistake"
  | "DefensiveError"
  | "WonderGoal"
  | "Deflection"
  | "OwnGoal"
  | "DisallowedGoal"
  | "LateDrama"
  | "HalfTime"
  | "FullTime"
  | "Kickoff"
  /** Manager-driven substitution, injected into the highlight feed at
   *  the moment the user makes the swap. `playerId` = on-coming sub,
   *  `subOffPlayerId` = player coming off. Doesn't affect the engine
   *  result, but live ratings re-attribute and the on-pitch dot for
   *  that slot updates. */
  | "Substitution";

export interface PlayerMatchRating {
  playerId: string;
  rating: number;
  goals: number;
  assists: number;
  yellow: boolean;
  red: boolean;
  injured: boolean;
}

export interface MatchResult {
  fixtureId: string;
  competitionId: string;
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  stats: {
    home: TeamMatchStats;
    away: TeamMatchStats;
  };
  ratings: {
    home: PlayerMatchRating[];
    away: PlayerMatchRating[];
  };
  manOfMatchPlayerId: string | null;
  attendance: number;
  weather: Weather;
  story: HiddenMatchStory;
  homeMoneyEarned: number;
  awayMoneyEarned: number;
  fanMoodChangeHome: number;
  fanMoodChangeAway: number;
  boardConfidenceChangeHome: number;
  boardConfidenceChangeAway: number;
}

export interface TeamMatchStats {
  xG: number;
  shots: number;
  shotsOnTarget: number;
  possession: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
}

export type Weather =
  | "Clear"
  | "Cloudy"
  | "Rain"
  | "Heavy Rain"
  | "Snow"
  | "Windy"
  | "Hot";

export type HiddenMatchStory =
  | "Normal Match"
  | "Favourite Complacent"
  | "Underdog Inspired"
  | "Keeper Masterclass"
  | "Early Red Card"
  | "Bad Weather"
  | "Cup Shock"
  | "Striker On Fire"
  | "Defensive Battle"
  | "Derby Chaos"
  | "Injury Crisis"
  | "Tactical Masterclass"
  | "Nervy Title Race"
  | "Relegation Scrap"
  | "Promotion Pressure"
  | "European Night";

export interface LeagueTableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ("W" | "D" | "L")[];
}

export interface LeagueTable {
  competitionId: string;
  rows: LeagueTableRow[];
}

// =====================================================================
// TACTICS / LINEUPS
// =====================================================================

export interface FormationSlot {
  id: string;
  position: DetailedPosition;
  x: number; // 0..1 (left-right)
  y: number; // 0..1 (back-forward)
}

export interface Formation {
  key: FormationKey;
  slots: FormationSlot[];
}

// =====================================================================
// PLAYER ROLES — per-slot tactical instruction. "Default" means follow
// the system; everything else is a Football-Manager-style nudge.
//
// Not every role is valid in every position — `rolesForPosition()` in
// /src/data/playerRoles.ts returns the contextual menu. The match
// engine can read this to bias attacking/defensive intent later.
// =====================================================================
export type PlayerRole =
  | "Default"
  // Forwards / strikers
  | "Run Forward"     // Make runs in behind, latch onto through balls
  | "Hold Up"         // Take the ball in, link play, win fouls
  | "Drift Wide"      // Pull defenders wide to create space
  | "Cut Inside"      // Inverted forward / winger
  // Midfielders
  | "Get Forward"     // Late runs into the box
  | "Stay Back"       // Sit deeper, screen the back four
  | "Playmaker"       // Drop deep, dictate tempo
  | "Press High"      // Aggressive press up the pitch
  // Wide defenders
  | "Overlap"         // Bomb on outside the winger
  | "Underlap"        // Tuck inside, third-man runs
  | "Defensive WB"    // Cautious wing-back, prioritise defending
  // Centre-backs
  | "Stopper"         // Step out, win the first ball
  | "Cover"           // Sit deeper, sweep behind
  // Goalkeeper
  | "Sweeper Keeper"; // Aggressive off the line

export interface Lineup {
  clubId: string;
  formationKey: FormationKey;
  tactic: Tactic;
  // slotId -> playerId
  starters: Record<string, string>;
  bench: string[];
  captainId: string | null;
  penaltyTakerId: string | null;
  freeKickTakerId: string | null;
  cornerTakerId: string | null;
  /** slotId -> tactical role for that slot. Missing keys imply "Default".
   * Optional so older saves keep working without a migration. */
  roles?: Record<string, PlayerRole>;
  /** slotId -> manual position override for that slot. Lets the user
   * drag a CM up to an AM zone, push the RW further forward, etc.,
   * without having to swap formations. The override is { x, y } in
   * 0..1 normalised pitch space (matching `FormationSlot`) plus the
   * recomputed `position` label. Missing keys mean "use the formation
   * default". Optional so older saves keep working without migration. */
  slotPositions?: Record<
    string,
    { x: number; y: number; position: DetailedPosition }
  >;
}

// =====================================================================
// INBOX / EVENTS
// =====================================================================

export interface InboxMessage {
  id: string;
  week: number;
  season: number;
  category:
    | "Transfer"
    | "Injury"
    | "Board"
    | "Fans"
    | "Rival"
    | "MatchPreview"
    | "MatchReport"
    | "JobOffer"
    | "Contract"
    | "Youth"
    | "Stadium"
    | "Cup"
    | "European"
    | "General";
  title: string;
  body: string;
  read: boolean;
  important: boolean;
}

// =====================================================================
// CAREER / SAVE STATE
// =====================================================================

export interface ManagerProfile {
  name: string;
  reputation: number;
  reputationLevel: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  managerLevelLabel: string;
  /** Legacy — list of one-line trophy descriptions. Kept for compat;
   * structured trophies live in {@link history.trophies}. */
  trophies: string[];
  /** Lifetime aggregated match record. Optional so older saves load. */
  stats?: ManagerStats;
  /** Lifetime award timeline — Manager of the Month/Year, Promotion etc. */
  awards?: ManagerAward[];
  /** Per-season summary of the manager's career. */
  seasonHistory?: ManagerSeasonRecord[];
}

// =====================================================================
// MANAGER STATS, AWARDS, SEASON HISTORY
// =====================================================================

export type ManagerAwardType =
  | "League Title"
  | "Cup Winner"
  | "Manager of the Month"
  | "Manager of the Year"
  | "Promotion"
  | "Survival"
  | "Objective Met";

export interface ManagerAward {
  id: string;
  type: ManagerAwardType;
  season: number;
  /** For Manager of the Month-style awards. */
  week?: number;
  /** Competition this award relates to (when applicable). */
  competitionId?: string;
  /** Club the manager was at when the award was earned. */
  clubId: string;
  /** One-line plain-language description. */
  description: string;
}

export interface ManagerStats {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  /** Lifetime trophy count (winners only). */
  trophies: number;
  /** Average points per game (3W + 1D) / matches. */
  ppg: number;
  /** Win % as a 0-100 integer. */
  winPct: number;
}

export interface ManagerSeasonRecord {
  season: number;
  clubId: string;
  divisionId: string;
  /** Final league position. */
  finalPosition: number;
  /** Total league/cup matches managed. */
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Trophies awarded that season at this club. */
  trophies: Trophy[];
  /** Awards earned that season. */
  awards: ManagerAward[];
  /** League points haul. */
  points: number;
}

export interface Career {
  id: string;
  createdAt: string;
  updatedAt: string;
  managerName: string;
  selectedClubId: string;
  season: number;
  week: number;
  manager: ManagerProfile;
  /** Player ids the user's scouting network has produced reports on.
   * Anyone NOT in here (and not on the user's own club / not a free
   * agent in the youth pool) shows fogged stats — name, age, position,
   * nationality, club only — in profiles, popovers and squad lists.
   * Stored as a flat array so it serialises cleanly to localStorage. */
  scoutedPlayerIds: string[];
  /** When the final league fixture of a season is played, the store
   * stops short of the off-season transition and stamps a full
   * `SeasonReport` here. The /season/end page reads from this to render
   * the celebratory scrapbook (final position, prize money, golden
   * boot, qualifications, etc.). The user must click "Start New Season"
   * to actually retire elders, age survivors, regen youth and reset
   * fixtures — that's `commitSeasonRollover()` in the store. While
   * this field is non-null the AppShell redirects every nav click to
   * /season/end so the user has to acknowledge their season. */
  pendingSeasonReport?: SeasonReport | null;
}

// =====================================================================
// SEASON REPORT — end-of-season scrapbook payload.
// Built once when the last league fixture is played and held on the
// Career until the user commits the off-season rollover. Everything the
// /season/end screen needs lives here so we don't have to re-derive
// from a mutated post-rollover database.
// =====================================================================

/** A single payment owed to a single club from the prize money engine.
 * Mirrored here (not imported) so the type stays serialisable to JSON
 * and survives a save/load round-trip. */
export interface SeasonReportPayout {
  competitionId: string;
  position?: number;
  amount: number;
  reason: string;
}

/** Per-player headline numbers used to populate the Golden Boot,
 * Top Assists and Top Rated leaderboards on the season-end screen.
 * Stored as a flat snapshot so the screen still renders correctly
 * after the rollover (which zeroes Player.goals/assists). */
export interface SeasonReportPlayerEntry {
  playerId: string;
  name: string;
  clubId: string;
  divisionId: string;
  position: Position;
  goals: number;
  assists: number;
  appearances: number;
  averageRating: number;
}

/** Final-table snapshot for one division — drives the standings panel
 * and the promoted/relegated badges on the season-end screen. */
export interface SeasonReportDivisionStandings {
  divisionId: string;
  rows: Array<{
    clubId: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  }>;
  /** Club ids that earned promotion (top 3 of D1/D2/D3). */
  promotedClubIds: string[];
  /** Club ids that fell through the trapdoor (bottom 3 of Prem/D1/D2). */
  relegatedClubIds: string[];
}

export interface SeasonReport {
  /** Season number that just finished (the one being celebrated). */
  season: number;
  /** Convenience copy of the user's club id at season close. */
  userClubId: string;
  /** Division the user finished in. */
  userDivisionId: string;
  /** 1-indexed final league position, null if user hadn't been wired
   * into a division (defensive). */
  userFinalPosition: number | null;

  // ----- User club season summary -----
  userMatches: number;
  userWins: number;
  userDraws: number;
  userLosses: number;
  userGoalsFor: number;
  userGoalsAgainst: number;
  /** Points-per-game — handy for the headline "Form" stat. */
  userPpg: number;

  // ----- Silverware & awards -----
  /** All trophies the user earned this season (1 = winner, 2 = runner-up
   * etc.). Includes league finishing positions 1-3 and any cup wins. */
  trophies: Trophy[];
  /** Manager awards earned this season (League Title, MOTY, Promotion,
   * Survival, Manager of the Month). */
  awards: ManagerAward[];

  // ----- Money -----
  /** Sum of every payout to the user's club. */
  prizeTotal: number;
  /** Itemised payout list (each league finish + any cup runs). */
  prizePayouts: SeasonReportPayout[];
  /** Updated transfer budget after prize money landed. */
  newBudget: number;

  // ----- Knock-on consequences -----
  /** True when the user's club finishes top 4 in the Premier (Champions
   * Cup place). False if outside top 4 or in a lower division. */
  championsCupQualified: boolean;
  /** True when the user finishes 5th-6th in the Premier (Continental
   * Cup place). */
  continentalCupQualified: boolean;
  /** True when the user's club finished in the promotion zone of D1/D2/D3
   * (top 3). */
  promoted: boolean;
  /** True when the user's club finished in the relegation zone
   * (bottom 3 of Prem/D1/D2). */
  relegated: boolean;

  // ----- World snapshot -----
  /** Final tables for all four divisions. */
  standings: SeasonReportDivisionStandings[];
  /** Champions of each division (for the "New Champions" strip). */
  divisionChampions: Array<{ divisionId: string; clubId: string }>;

  // ----- Individual leaderboards (user's division only) -----
  topScorers: SeasonReportPlayerEntry[];
  topAssists: SeasonReportPlayerEntry[];
  topRated: SeasonReportPlayerEntry[];

  /** World-wide top scorer (for the "Golden Boot" headline if the
   * user's division didn't produce the global leader). */
  worldGoldenBoot: SeasonReportPlayerEntry | null;

  /** ISO timestamp the report was generated (for diagnostics / sorting). */
  generatedAt: string;
}

export interface GameDatabase {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  competitions: Record<string, Competition>;
  fixtures: Fixture[];
  tables: Record<string, LeagueTable>;
  lineups: Record<string, Lineup>;
  inbox: InboxMessage[];
}

export interface GameState {
  career: Career | null;
  db: GameDatabase | null;
}

export interface SerializedSave {
  version: number;
  career: Career;
  db: GameDatabase;
}
