// =====================================================================
// CLUB SEED GENERATOR — produces 80 deterministic ClubSeeds for a
// nation given a city pool + flavour config. Used to seed every
// non-English nation in the world without hand-crafting hundreds of
// lines of seed data.
//
// The generator is fully deterministic — given the same nation id +
// city list + master seed, it always produces the same 80 clubs in
// the same order with the same ids. So saves remain stable as long
// as the city pool doesn't change.
// =====================================================================

import type { ClubSeed } from "@/data/clubSeeds";
import type { ClubPersonality, PlayStyle } from "@/types/game";
import { createRng } from "@/lib/rng";

interface NationFlavour {
  /** Stable ID prefix used for every generated club id (e.g. "ita"
   *  → club ids look like "ita_milana_fc"). */
  idPrefix: string;
  /** Suffix templates applied to the city name to produce club name
   *  variations. Each entry is `(city) => { name, shortName }`. */
  nameTemplates: Array<(city: string, idx: number) => { name: string; shortName: string }>;
  /** Stadium name templates. */
  stadiumTemplates: Array<(city: string) => string>;
  /** Tints favoured by clubs in this nation (used as primary kit
   *  colours). Should include the flag colours plus a few common
   *  football kit shades. */
  primaryColors: string[];
  /** Secondary colour palette — typically white / black / contrast
   *  options. */
  secondaryColors: string[];
  /** Accent colours — splash colour for badges. */
  accentColors: string[];
}

/** Build the 80 ClubSeeds for a nation. The first 20 cities go to
 *  tier 1 (top flight), next 20 to tier 2, etc. */
export function generateClubSeeds(
  nationId: string,
  cities: string[],
  flavour: NationFlavour,
): ClubSeed[] {
  if (cities.length < 80) {
    throw new Error(
      `Nation ${nationId} needs at least 80 cities to seed 4 divisions × 20 clubs (got ${cities.length})`,
    );
  }
  const rng = createRng(`seedGen:${nationId}`);
  const seeds: ClubSeed[] = [];

  const BADGE_SHAPES: ClubSeed["badgeShape"][] = ["shield", "circle", "diamond", "crest", "oval"];
  const BADGE_ICONS: ClubSeed["badgeIcon"][] = [
    "lion", "eagle", "wheel", "anchor", "tower", "star", "wave", "crown", "wheel",
    "dragon", "horse", "castle", "flame", "bridge", "rose", "mountain", "sun", "bolt",
    "stag", "falcon", "hammer", "tree", "river", "sword",
  ];
  const BADGE_PATTERNS: ClubSeed["badgePattern"][] = [
    "plain", "stripes", "hoops", "diagonal", "halves", "quarters", "chevron",
  ];
  const KIT_PATTERNS: ClubSeed["kitPattern"][] = [
    "plain", "vertical-stripes", "hoops", "sash", "halves", "diagonal",
    "sleeves", "pinstripes", "checker",
  ];

  // Personality + play style distribution per tier so each division
  // has the same clear hierarchy the English seeds enjoy.
  const TIER_PERSONALITIES: Record<number, ClubPersonality[]> = {
    1: [
      "Big City Club", "Big City Club", "Money Club", "Historic Club", "Historic Club",
      "Sleeping Giant", "Sleeping Giant", "Industrial Club", "Working-Class Club",
      "Cup Fighter", "Coastal Club", "Port Club", "Flashy New Club",
      "Promotion Hunter", "Local Underdog", "Local Underdog", "Local Underdog",
      "Working-Class Club", "Cup Fighter", "Sleeping Giant",
    ],
    2: [
      "Sleeping Giant", "Sleeping Giant", "Promotion Hunter", "Promotion Hunter",
      "Industrial Club", "Industrial Club", "Working-Class Club", "Working-Class Club",
      "Coastal Club", "Coastal Club", "Cup Fighter", "Local Underdog", "Local Underdog",
      "Port Club", "Historic Club", "Mining Town Club", "Local Underdog",
      "Promotion Hunter", "Local Underdog", "Local Underdog",
    ],
    3: [
      "Promotion Hunter", "Local Underdog", "Local Underdog", "Local Underdog",
      "Working-Class Club", "Working-Class Club", "Mining Town Club", "Cup Fighter",
      "Sleeping Giant", "Coastal Club", "Local Underdog", "Local Underdog",
      "Working-Class Club", "Promotion Hunter", "Industrial Club", "Local Underdog",
      "Local Underdog", "Coastal Club", "Local Underdog", "Cup Fighter",
    ],
    4: [
      "Local Underdog", "Local Underdog", "Working-Class Club", "Local Underdog",
      "Mining Town Club", "Mining Town Club", "Local Underdog", "Local Underdog",
      "Crisis Club", "Crisis Club", "Local Underdog", "Promotion Hunter",
      "Coastal Club", "Local Underdog", "Local Underdog", "Cup Fighter",
      "Local Underdog", "Working-Class Club", "Local Underdog", "Local Underdog",
    ],
  };

  const PLAY_STYLES: PlayStyle[] = [
    "Possession", "Counter", "Direct", "High Press", "Defensive", "Attacking",
    "Balanced", "Physical",
  ];

  for (let tier = 1; tier <= 4; tier++) {
    const tierCities = cities.slice((tier - 1) * 20, tier * 20);
    const personalities = TIER_PERSONALITIES[tier];
    tierCities.forEach((city, i) => {
      const tplIdx = (tier * 7 + i) % flavour.nameTemplates.length;
      const tpl = flavour.nameTemplates[tplIdx](city, i);
      // Slug — strip non-alphanumeric, lowercase, dedupe-safe.
      const slug = tpl.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
      const id = `${flavour.idPrefix}_${slug}`;
      const seed: ClubSeed = {
        id,
        name: tpl.name,
        shortName: tpl.shortName,
        city,
        divisionTier: tier as 1 | 2 | 3 | 4,
        primary: rng.pick(flavour.primaryColors),
        secondary: rng.pick(flavour.secondaryColors),
        accent: rng.pick(flavour.accentColors),
        badgeShape: rng.pick(BADGE_SHAPES),
        badgeIcon: rng.pick(BADGE_ICONS),
        badgePattern: rng.pick(BADGE_PATTERNS),
        kitPattern: rng.pick(KIT_PATTERNS),
        stadium: flavour.stadiumTemplates[(tier * 3 + i) % flavour.stadiumTemplates.length](city),
        foundingYear: rng.int(tier === 1 ? 1880 : 1890, tier === 4 ? 1965 : 1935),
        personality: personalities[i],
        playStyle: rng.pick(PLAY_STYLES),
      };
      seeds.push(seed);
    });
  }

  // Pair up rivalries within each tier — every odd-indexed club in a
  // tier rivals the previous one. Adds story flavour without us
  // having to author them.
  for (let tier = 1; tier <= 4; tier++) {
    const tierStart = (tier - 1) * 20;
    for (let i = 0; i < 20; i += 2) {
      const a = seeds[tierStart + i];
      const b = seeds[tierStart + i + 1];
      if (a && b) {
        a.rivalSeedId = b.id;
        b.rivalSeedId = a.id;
      }
    }
  }

  return seeds;
}

// =====================================================================
// PRESET FLAVOURS — one per non-English nation. Each captures the
// naming conventions + colour palettes that read as "of that country"
// without using any real club name.
// =====================================================================

export const ITALIAN_FLAVOUR: NationFlavour = {
  idPrefix: "ita",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `AC ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `AS ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `US ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Calcio ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Calcio`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Nuova ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `Stadio ${c}`,
    (c) => `Stadio Comunale di ${c}`,
    (c) => `Arena ${c}`,
    (c) => `Stadio Olimpico ${c}`,
    (c) => `${c} Stadium`,
    () => `Stadio Tre Stelle`,
    () => `Stadio del Sole`,
  ],
  primaryColors: ["#0F4FA8", "#C5161E", "#1A1A1A", "#0E5C2F", "#7A1F2E", "#E07B00", "#005091", "#2A0E47"],
  secondaryColors: ["#FFFFFF", "#FFD700", "#0A0A0A", "#F5E6CA"],
  accentColors: ["#FFD400", "#FFFFFF", "#E03A3E", "#1A1A1A", "#0E5C2F"],
};

export const SPANISH_FLAVOUR: NationFlavour = {
  idPrefix: "esp",
  nameTemplates: [
    (c) => ({ name: `Real ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Atletico ${c}`, shortName: `AT${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} CF`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Deportivo ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Sporting ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Union ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Athletic`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `Estadio ${c}`,
    (c) => `Estadio Municipal de ${c}`,
    () => `Estadio del Sol`,
    (c) => `Coliseo ${c}`,
    (c) => `${c} Stadium`,
    (c) => `Estadio Nuevo ${c}`,
  ],
  primaryColors: ["#AA151B", "#F1BF00", "#0040A0", "#7A1F2E", "#1A1A1A", "#005091", "#E03A3E", "#0E5C2F"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#F5E6CA", "#FFD700"],
  accentColors: ["#F1BF00", "#FFFFFF", "#AA151B", "#0E5C2F", "#1A1A1A"],
};

export const GERMAN_FLAVOUR: NationFlavour = {
  idPrefix: "ger",
  nameTemplates: [
    (c) => ({ name: `FC ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} 04`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `1. FC ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `SV ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `VfB ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `BV ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} 1900`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Arena`,
    (c) => `${c} Stadion`,
    (c) => `Allianz ${c}`,
    (c) => `Volksparkstadion ${c}`,
    (c) => `${c} Park`,
    (c) => `Olympiastadion ${c}`,
  ],
  primaryColors: ["#000000", "#DD0000", "#FFCE00", "#0F4FA8", "#1A1A1A", "#005091", "#7A1F2E", "#0E5C2F"],
  secondaryColors: ["#FFFFFF", "#FFCE00", "#DD0000", "#0A0A0A"],
  accentColors: ["#FFCE00", "#FFFFFF", "#DD0000", "#000000"],
};

export const FRENCH_FLAVOUR: NationFlavour = {
  idPrefix: "fra",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Olympique ${c}`, shortName: `O${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `AS ${c}`, shortName: `AS${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `RC ${c}`, shortName: `RC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `Stade ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Sportif`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Racing ${c}`, shortName: `RC${c.slice(0, 1).toUpperCase()}` }),
  ],
  stadiumTemplates: [
    (c) => `Stade ${c}`,
    (c) => `Parc des ${c}`,
    (c) => `Stade Municipal ${c}`,
    () => `Stade Vélodrome`,
    (c) => `Arena ${c}`,
    (c) => `${c} Stadium`,
  ],
  primaryColors: ["#0055A4", "#EF4135", "#1A1A1A", "#FFFFFF", "#FFC72C", "#0E5C2F", "#7A1F2E", "#005091"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#0055A4", "#EF4135"],
  accentColors: ["#FFC72C", "#FFFFFF", "#EF4135", "#0055A4", "#1A1A1A"],
};

export const DUTCH_FLAVOUR: NationFlavour = {
  idPrefix: "ned",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `FC ${c}`, shortName: `FC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} Eindhoven`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Vooruit`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `SC ${c}`, shortName: `SC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `VV ${c}`, shortName: `VV${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} United`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Stadion`,
    (c) => `Arena ${c}`,
    (c) => `${c} Park`,
    () => `Johan Cruijff Arena`,
    (c) => `De Kuip ${c}`,
    (c) => `${c} Veld`,
  ],
  primaryColors: ["#FF6B00", "#21468B", "#AE1C28", "#1A1A1A", "#FFFFFF", "#0E5C2F", "#FFC72C"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#FF6B00", "#21468B"],
  accentColors: ["#FF6B00", "#FFFFFF", "#21468B", "#FFC72C", "#1A1A1A"],
};

export const BELGIAN_FLAVOUR: NationFlavour = {
  idPrefix: "bel",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Royal ${c}`, shortName: `R${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} United`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Standard ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `KSV ${c}`, shortName: `KS${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `KAS ${c}`, shortName: `KA${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `Eendracht ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Stadion`,
    (c) => `Stade ${c}`,
    (c) => `Constant Vanden Stock ${c}`,
    (c) => `${c} Park`,
    () => `Bosuilstadion`,
    (c) => `${c} Arena`,
  ],
  primaryColors: ["#FAE042", "#000000", "#ED2939", "#0E5C2F", "#7A1F2E", "#005091", "#FFFFFF"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#FAE042", "#ED2939"],
  accentColors: ["#FAE042", "#FFFFFF", "#ED2939", "#0E5C2F", "#1A1A1A"],
};

export const PORTUGUESE_FLAVOUR: NationFlavour = {
  idPrefix: "por",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `SC ${c}`, shortName: `SC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `Vitória ${c}`, shortName: `V${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} CD`, shortName: `${c.slice(0, 2).toUpperCase()}CD` }),
    (c) => ({ name: `Académico ${c}`, shortName: `A${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `União ${c}`, shortName: `U${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Os ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `Estádio ${c}`,
    (c) => `Estádio Municipal de ${c}`,
    () => `Estádio do Dragão`,
    (c) => `Estádio da Luz ${c}`,
    (c) => `${c} Stadium`,
    (c) => `Estádio José Alvalade ${c}`,
  ],
  primaryColors: ["#006600", "#FF0000", "#1A1A1A", "#FFFFFF", "#FFC72C", "#7A1F2E", "#005091", "#0E5C2F"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#006600", "#FF0000"],
  accentColors: ["#FFC72C", "#FFFFFF", "#FF0000", "#006600", "#1A1A1A"],
};

export const TURKISH_FLAVOUR: NationFlavour = {
  idPrefix: "tur",
  nameTemplates: [
    (c) => ({ name: `${c} SK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c}spor`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} FK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Yeni ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Belediyespor`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Genç ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} BK`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Arena`,
    (c) => `${c} Stadyumu`,
    () => `Türk Telekom Arena`,
    (c) => `Atatürk ${c} Stadyumu`,
    (c) => `${c} Şehir Stadyumu`,
    (c) => `${c} Park`,
  ],
  primaryColors: ["#E30A17", "#1A1A1A", "#FFC72C", "#005091", "#7A1F2E", "#0E5C2F", "#FFFFFF"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#E30A17", "#FFC72C"],
  accentColors: ["#FFC72C", "#FFFFFF", "#E30A17", "#1A1A1A", "#005091"],
};

export const SWEDISH_FLAVOUR: NationFlavour = {
  idPrefix: "swe",
  nameTemplates: [
    (c) => ({ name: `${c} IF`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `IFK ${c}`, shortName: `IFK${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} BK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} FK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} AIK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Djurgårdens ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Hammarby ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Arena`,
    (c) => `${c} IP`,
    () => `Friends Arena`,
    (c) => `${c} Stadion`,
    (c) => `Tele2 Arena ${c}`,
    (c) => `${c} Idrottsplats`,
  ],
  primaryColors: ["#006AA7", "#FECC00", "#1A1A1A", "#FFFFFF", "#0E5C2F", "#7A1F2E", "#FF6B00"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#006AA7", "#FECC00"],
  accentColors: ["#FECC00", "#FFFFFF", "#006AA7", "#1A1A1A"],
};

export const NORWEGIAN_FLAVOUR: NationFlavour = {
  idPrefix: "nor",
  nameTemplates: [
    (c) => ({ name: `${c} IL`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} FK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} BK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} SK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Lyn ${c}`, shortName: `L${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Vålerenga`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Strindheim ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Stadion`,
    (c) => `${c} Idrettspark`,
    () => `Ullevaal Stadion`,
    (c) => `${c} Arena`,
    (c) => `Lerkendal ${c}`,
    (c) => `${c} Park`,
  ],
  primaryColors: ["#EF2B2D", "#002868", "#1A1A1A", "#FFFFFF", "#0E5C2F", "#FFC72C", "#7A1F2E"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#EF2B2D", "#002868"],
  accentColors: ["#EF2B2D", "#FFFFFF", "#002868", "#FFC72C"],
};

export const DANISH_FLAVOUR: NationFlavour = {
  idPrefix: "den",
  nameTemplates: [
    (c) => ({ name: `${c} BK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `FC ${c}`, shortName: `FC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} IF`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `AB ${c}`, shortName: `AB${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} GIF`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Kjøbenhavns ${c}`, shortName: `K${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Boldklub`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Stadion`,
    (c) => `${c} Park`,
    () => `Parken Stadion`,
    (c) => `Brøndby ${c}`,
    (c) => `${c} Idrætspark`,
    (c) => `${c} Arena`,
  ],
  primaryColors: ["#C8102E", "#1A1A1A", "#FFFFFF", "#005091", "#FFC72C", "#0E5C2F", "#7A1F2E"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#C8102E", "#005091"],
  accentColors: ["#C8102E", "#FFFFFF", "#FFC72C", "#1A1A1A"],
};

export const POLISH_FLAVOUR: NationFlavour = {
  idPrefix: "pol",
  nameTemplates: [
    (c) => ({ name: `KS ${c}`, shortName: `KS${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} SA`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Wisła ${c}`, shortName: `W${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Lechia ${c}`, shortName: `L${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Górnik ${c}`, shortName: `G${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Stal ${c}`, shortName: `S${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Polonia`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `Stadion ${c}`,
    (c) => `Stadion Miejski ${c}`,
    () => `Stadion Narodowy`,
    (c) => `${c} Arena`,
    (c) => `${c} Stadium`,
    (c) => `Stadion im. ${c}`,
  ],
  primaryColors: ["#DC143C", "#FFFFFF", "#1A1A1A", "#005091", "#FFC72C", "#0E5C2F", "#7A1F2E"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#DC143C", "#005091"],
  accentColors: ["#DC143C", "#FFFFFF", "#FFC72C", "#005091", "#1A1A1A"],
};

export const UKRAINIAN_FLAVOUR: NationFlavour = {
  idPrefix: "ukr",
  nameTemplates: [
    (c) => ({ name: `FC ${c}`, shortName: `FC${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `Dynamo ${c}`, shortName: `D${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Shakhtar ${c}`, shortName: `Sh${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Metalist ${c}`, shortName: `M${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Karpaty`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Chornomorets ${c}`, shortName: `Ch${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Avanhard`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `Stadion ${c}`,
    (c) => `Olimpiyskyi ${c}`,
    () => `NSC Olimpiyskyi`,
    (c) => `${c} Arena`,
    (c) => `Donbass ${c}`,
    (c) => `${c} Sport Park`,
  ],
  primaryColors: ["#005BBB", "#FFD500", "#1A1A1A", "#FFFFFF", "#0E5C2F", "#7A1F2E", "#005091"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#005BBB", "#FFD500"],
  accentColors: ["#FFD500", "#FFFFFF", "#005BBB", "#1A1A1A"],
};

export const CZECH_FLAVOUR: NationFlavour = {
  idPrefix: "cze",
  nameTemplates: [
    (c) => ({ name: `FK ${c}`, shortName: `FK${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `${c} SK`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Slavia ${c}`, shortName: `S${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Sparta ${c}`, shortName: `Sp${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `${c} Bohemians`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Sigma ${c}`, shortName: `Sg${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Viktoria ${c}`, shortName: `V${c.slice(0, 2).toUpperCase()}` }),
  ],
  stadiumTemplates: [
    (c) => `Stadion ${c}`,
    (c) => `${c} Arena`,
    () => `Eden Aréna`,
    (c) => `${c} Stadion`,
    (c) => `Letná ${c}`,
    (c) => `${c} Stadium`,
  ],
  primaryColors: ["#11457E", "#D7141A", "#1A1A1A", "#FFFFFF", "#0E5C2F", "#FFC72C", "#7A1F2E"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#11457E", "#D7141A"],
  accentColors: ["#D7141A", "#FFFFFF", "#11457E", "#FFC72C"],
};

export const GREEK_FLAVOUR: NationFlavour = {
  idPrefix: "gre",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `AS ${c}`, shortName: `AS${c.slice(0, 1).toUpperCase()}` }),
    (c) => ({ name: `Olympiakos ${c}`, shortName: `O${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Aris ${c}`, shortName: `A${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Apollon ${c}`, shortName: `Ap${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Iraklis ${c}`, shortName: `Ir${c.slice(0, 2).toUpperCase()}` }),
    (c) => ({ name: `Atromitos ${c}`, shortName: `At${c.slice(0, 2).toUpperCase()}` }),
  ],
  stadiumTemplates: [
    (c) => `Stadio ${c}`,
    (c) => `${c} Stadium`,
    () => `Karaiskakis Stadium`,
    (c) => `Olympiakó ${c}`,
    (c) => `Toumba ${c}`,
    (c) => `${c} Arena`,
  ],
  primaryColors: ["#0D5EAF", "#FFFFFF", "#1A1A1A", "#FFC72C", "#0E5C2F", "#7A1F2E", "#005091"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#0D5EAF", "#FFC72C"],
  accentColors: ["#0D5EAF", "#FFFFFF", "#FFC72C", "#1A1A1A"],
};

export const SCOTTISH_FLAVOUR: NationFlavour = {
  idPrefix: "sco",
  nameTemplates: [
    (c) => ({ name: `${c} FC`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Rangers`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Celtic`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} United`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Athletic`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `Royal ${c}`, shortName: c.slice(0, 3).toUpperCase() }),
    (c) => ({ name: `${c} Thistle`, shortName: c.slice(0, 3).toUpperCase() }),
  ],
  stadiumTemplates: [
    (c) => `${c} Park`,
    (c) => `${c} Stadium`,
    (c) => `${c} Field`,
    (c) => `${c} Highlands`,
    (c) => `Hampden ${c}`,
    (c) => `Tynecastle ${c}`,
  ],
  primaryColors: ["#0065BD", "#1A1A1A", "#7A1F2E", "#0E5C2F", "#005091", "#FFFFFF", "#0040A0", "#1B4D89"],
  secondaryColors: ["#FFFFFF", "#0A0A0A", "#FFD700", "#0065BD"],
  accentColors: ["#FFD700", "#FFFFFF", "#0065BD", "#1A1A1A"],
};
