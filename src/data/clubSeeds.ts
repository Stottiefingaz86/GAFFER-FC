// =====================================================================
// 80 FICTIONAL CLUB SEEDS — divided across 4 divisions, 20 each.
// All names, badges, kits, stadia are intentionally fictional.
// =====================================================================

import type { ClubPersonality, PlayStyle } from "@/types/game";

export interface ClubSeed {
  id: string;
  name: string;
  shortName: string;
  city: string;
  /** Which nation this club belongs to. Optional for the legacy
   *  English seeds (which default to "england" in the team
   *  generator); always set for procedural seeds. */
  nationId?: string;
  divisionTier: 1 | 2 | 3 | 4;
  primary: string;
  secondary: string;
  accent: string;
  badgeShape: "shield" | "circle" | "diamond" | "crest" | "oval";
  badgeIcon:
    | "lion" | "anchor" | "tower" | "star" | "wave" | "crown" | "eagle" | "wheel"
    | "dragon" | "horse" | "castle" | "flame" | "bridge" | "rose" | "mountain"
    | "sun" | "bolt" | "stag" | "falcon" | "hammer" | "tree" | "river" | "sword";
  badgePattern:
    | "plain" | "stripes" | "hoops" | "diagonal" | "halves" | "quarters" | "chevron";
  kitPattern:
    | "plain" | "vertical-stripes" | "hoops" | "sash" | "halves" | "diagonal"
    | "sleeves" | "pinstripes" | "checker";
  stadium: string;
  foundingYear: number;
  personality: ClubPersonality;
  playStyle: PlayStyle;
  rivalSeedId?: string;
  /** Filename (relative to `/public/badges/`) of the hand-drawn crest sprite
   * for this club. Set whenever a sprite slot is mapped; clubs without a
   * mapping fall back to the procedural Badge. */
  crestSprite?: string;
}

// Helpers to keep the file readable.
const D1 = (s: Omit<ClubSeed, "divisionTier">): ClubSeed => ({ ...s, divisionTier: 1 });
const D2 = (s: Omit<ClubSeed, "divisionTier">): ClubSeed => ({ ...s, divisionTier: 2 });
const D3 = (s: Omit<ClubSeed, "divisionTier">): ClubSeed => ({ ...s, divisionTier: 3 });
const D4 = (s: Omit<ClubSeed, "divisionTier">): ClubSeed => ({ ...s, divisionTier: 4 });

export const CLUB_SEEDS: ClubSeed[] = [
  // ============== PREMIER DIVISION (20) ==============
  D1({ id:"capital_city", name:"Capital City FC", shortName:"CAP", city:"Capital City",
       primary:"#0B3D91", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"crown", badgePattern:"halves", kitPattern:"plain",
       stadium:"Crown Park", foundingYear:1888, personality:"Big City Club", playStyle:"Possession",
       rivalSeedId:"royal_albion" }),
  D1({ id:"royal_albion", name:"Royal Albion", shortName:"ALB", city:"Royal Albion",
       primary:"#7E1A2D", secondary:"#F5E6CA", accent:"#000000",
       badgeShape:"crest", badgeIcon:"lion", badgePattern:"plain", kitPattern:"plain",
       stadium:"Albion Fields", foundingYear:1879, personality:"Historic Club", playStyle:"Balanced",
       rivalSeedId:"capital_city" }),
  D1({ id:"northern_borough", name:"Northern Borough", shortName:"NBO", city:"Northborough",
       primary:"#003B49", secondary:"#FFFFFF", accent:"#C8102E",
       badgeShape:"shield", badgeIcon:"tower", badgePattern:"chevron", kitPattern:"vertical-stripes",
       stadium:"Borough Ground", foundingYear:1894, personality:"Industrial Club", playStyle:"Physical",
       rivalSeedId:"westway_united" }),
  D1({ id:"westway_united", name:"Westway United", shortName:"WES", city:"Westway",
       primary:"#1E2952", secondary:"#FFD400", accent:"#FFFFFF",
       badgeShape:"circle", badgeIcon:"eagle", badgePattern:"plain", kitPattern:"plain",
       stadium:"Westway Arena", foundingYear:1899, personality:"Big City Club", playStyle:"Attacking",
       rivalSeedId:"northern_borough" }),
  D1({ id:"dockside_reds", name:"Dockside Reds", shortName:"DOC", city:"Dockside",
       primary:"#C1121F", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"plain",
       stadium:"The Dockyard", foundingYear:1875, personality:"Working-Class Club", playStyle:"High Press",
       rivalSeedId:"mersey_dockers" }),
  D1({ id:"mersey_dockers", name:"Mersey Dockers", shortName:"MER", city:"Mersey",
       primary:"#003F87", secondary:"#FFFFFF", accent:"#C8102E",
       badgeShape:"crest", badgeIcon:"wheel", badgePattern:"plain", kitPattern:"plain",
       stadium:"Portside Arena", foundingYear:1881, personality:"Port Club", playStyle:"Possession",
       rivalSeedId:"dockside_reds" }),
  D1({ id:"yorkshire_united", name:"Yorkshire United", shortName:"YOR", city:"Yorkshire",
       primary:"#FFFFFF", secondary:"#0E2D52", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"rose", badgePattern:"plain", kitPattern:"plain",
       stadium:"Highmore Stadium", foundingYear:1872, personality:"Sleeping Giant", playStyle:"Direct",
       rivalSeedId:"leeds_borough" }),
  D1({ id:"leeds_borough", name:"Leeds Borough", shortName:"LBO", city:"Leeds",
       primary:"#FFFFFF", secondary:"#1B428A", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"sword", badgePattern:"plain", kitPattern:"sleeves",
       stadium:"The Battlements", foundingYear:1919, personality:"Fallen Giant", playStyle:"Counter",
       rivalSeedId:"yorkshire_united" }),
  D1({ id:"south_london_athletic", name:"South London Athletic", shortName:"SLA", city:"South London",
       primary:"#E03A3E", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"diamond", badgeIcon:"hammer", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Templeway Ground", foundingYear:1905, personality:"Big City Club", playStyle:"High Press",
       rivalSeedId:"south_london_rovers" }),
  D1({ id:"brighton_pier_fc", name:"Brighton Pier FC", shortName:"BPR", city:"Brighton Pier",
       primary:"#0057B7", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"wave", badgePattern:"stripes", kitPattern:"vertical-stripes",
       stadium:"The Pierfront", foundingYear:1901, personality:"Coastal Club", playStyle:"Possession" }),
  D1({ id:"oldcastle_united", name:"Oldcastle United", shortName:"OLD", city:"Oldcastle",
       primary:"#000000", secondary:"#FFFFFF", accent:"#A41E22",
       badgeShape:"shield", badgeIcon:"castle", badgePattern:"stripes", kitPattern:"vertical-stripes",
       stadium:"Oldcastle Ground", foundingYear:1892, personality:"Historic Club", playStyle:"Balanced",
       rivalSeedId:"sunderland_port" }),
  D1({ id:"sunderland_port", name:"Sunderland Port", shortName:"SUN", city:"Sunderland",
       primary:"#E40023", secondary:"#FFFFFF", accent:"#FFD400",
       badgeShape:"crest", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"vertical-stripes",
       stadium:"Mariners Ground", foundingYear:1879, personality:"Working-Class Club", playStyle:"Direct",
       rivalSeedId:"oldcastle_united" }),
  D1({ id:"midlands_town", name:"Midlands Town", shortName:"MID", city:"Midlands",
       primary:"#5C2D91", secondary:"#FFFFFF", accent:"#FFD400",
       badgeShape:"shield", badgeIcon:"horse", badgePattern:"plain", kitPattern:"plain",
       stadium:"Midlands Bowl", foundingYear:1885, personality:"Money Club", playStyle:"Attacking" }),
  D1({ id:"derby_foundry", name:"Derby Foundry", shortName:"DER", city:"Derby",
       primary:"#FFFFFF", secondary:"#0E1F3F", accent:"#000000",
       badgeShape:"shield", badgeIcon:"hammer", badgePattern:"plain", kitPattern:"plain",
       stadium:"Foundry Park", foundingYear:1884, personality:"Industrial Club", playStyle:"Counter" }),
  D1({ id:"coventry_motors", name:"Coventry Motors", shortName:"COV", city:"Coventry",
       primary:"#5BBFFF", secondary:"#1A1A1A", accent:"#FFFFFF",
       badgeShape:"circle", badgeIcon:"wheel", badgePattern:"plain", kitPattern:"plain",
       stadium:"Aldgate Park", foundingYear:1883, personality:"Historic Club", playStyle:"Balanced" }),
  D1({ id:"cardiff_harbour", name:"Cardiff Harbour", shortName:"CAR", city:"Cardiff",
       primary:"#0070BB", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"dragon", badgePattern:"plain", kitPattern:"plain",
       stadium:"St. Aldwin's Park", foundingYear:1899, personality:"Coastal Club", playStyle:"Direct" }),
  D1({ id:"reading_royals", name:"Reading Royals", shortName:"REA", city:"Reading",
       primary:"#0040A0", secondary:"#FFFFFF", accent:"#E03A3E",
       badgeShape:"crest", badgeIcon:"crown", badgePattern:"hoops", kitPattern:"hoops",
       stadium:"Kings Field", foundingYear:1871, personality:"Sleeping Giant", playStyle:"Possession" }),
  D1({ id:"manilva_town", name:"Manilva Town", shortName:"MAN", city:"Manilva",
       primary:"#FFD000", secondary:"#003B49", accent:"#FFFFFF",
       badgeShape:"oval", badgeIcon:"sun", badgePattern:"halves", kitPattern:"halves",
       stadium:"Bellfield", foundingYear:1923, personality:"Flashy New Club", playStyle:"Attacking" }),
  D1({ id:"oxford_scholars", name:"Oxford Scholars", shortName:"OXF", city:"Oxford",
       primary:"#0A1F44", secondary:"#FFD700", accent:"#FFFFFF",
       badgeShape:"crest", badgeIcon:"tree", badgePattern:"plain", kitPattern:"plain",
       stadium:"The Spires", foundingYear:1893, personality:"University Club", playStyle:"Possession" }),
  D1({ id:"lancashire_lions", name:"Lancashire Lions", shortName:"LAN", city:"Lancashire",
       primary:"#E03A3E", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"lion", badgePattern:"chevron", kitPattern:"sleeves",
       stadium:"The Crucible", foundingYear:1888, personality:"Historic Club", playStyle:"Balanced" }),

  // ============== DIVISION ONE (20) ==============
  D2({ id:"south_london_rovers", name:"South London Rovers", shortName:"SLR", city:"South London",
       primary:"#1A4A1A", secondary:"#FFFFFF", accent:"#FFD400",
       badgeShape:"shield", badgeIcon:"falcon", badgePattern:"halves", kitPattern:"halves",
       stadium:"St. Cuthbert's Park", foundingYear:1882, personality:"Big City Club", playStyle:"Counter",
       rivalSeedId:"south_london_athletic" }),
  D2({ id:"east_port_city", name:"Eastport City", shortName:"EPC", city:"Eastport",
       primary:"#193D6B", secondary:"#F4C430", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"wave", badgePattern:"plain", kitPattern:"vertical-stripes",
       stadium:"Eastport Park", foundingYear:1898, personality:"Port Club", playStyle:"Direct" }),
  D2({ id:"south_coast_rovers", name:"South Coast Rovers", shortName:"SCR", city:"South Coast",
       primary:"#003366", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"river", badgePattern:"plain", kitPattern:"hoops",
       stadium:"Coastline Stadium", foundingYear:1903, personality:"Coastal Club", playStyle:"Possession" }),
  D2({ id:"plymouth_coast", name:"Plymouth Coast", shortName:"PLY", city:"Plymouth",
       primary:"#1B5E20", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"plain",
       stadium:"Beachway Stadium", foundingYear:1886, personality:"Coastal Club", playStyle:"Direct" }),
  D2({ id:"sheffield_works", name:"Sheffield Works", shortName:"SHE", city:"Sheffield",
       primary:"#FF7900", secondary:"#000000", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"hammer", badgePattern:"stripes", kitPattern:"vertical-stripes",
       stadium:"The Iron Gates", foundingYear:1857, personality:"Industrial Club", playStyle:"Physical" }),
  D2({ id:"bristol_vale", name:"Bristol Vale", shortName:"BRV", city:"Bristol Vale",
       primary:"#A32C2C", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"crest", badgeIcon:"bridge", badgePattern:"plain", kitPattern:"plain",
       stadium:"The Bywater", foundingYear:1894, personality:"Working-Class Club", playStyle:"Direct" }),
  D2({ id:"nottingham_forestside", name:"Nottingham Forestside", shortName:"NOT", city:"Nottingham Forestside",
       primary:"#DD0000", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"tree", badgePattern:"plain", kitPattern:"plain",
       stadium:"Greenacre Park", foundingYear:1865, personality:"Historic Club", playStyle:"Counter" }),
  D2({ id:"wigan_borough", name:"Wigan Borough", shortName:"WIG", city:"Wigan",
       primary:"#0072CE", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"diamond", badgeIcon:"hammer", badgePattern:"diagonal", kitPattern:"plain",
       stadium:"The Brickworks", foundingYear:1932, personality:"Working-Class Club", playStyle:"Defensive" }),
  D2({ id:"exeter_cityside", name:"Exeter Cityside", shortName:"EXE", city:"Exeter",
       primary:"#A21C28", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"stag", badgePattern:"plain", kitPattern:"plain",
       stadium:"St. Joscelyn's Park", foundingYear:1904, personality:"Local Underdog", playStyle:"Balanced" }),
  D2({ id:"harbour_athletic", name:"Harbour Athletic", shortName:"HBR", city:"Harbour",
       primary:"#005EB8", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"oval", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"sleeves",
       stadium:"Harbour Lane", foundingYear:1893, personality:"Port Club", playStyle:"High Press" }),
  D2({ id:"estepona_athletic", name:"Estepona Athletic", shortName:"EST", city:"Estepona",
       primary:"#F4C430", secondary:"#003B49", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"sun", badgePattern:"halves", kitPattern:"halves",
       stadium:"The Esplanade", foundingYear:1921, personality:"Coastal Club", playStyle:"Possession" }),
  D2({ id:"coastal_union", name:"Coastal Union", shortName:"COU", city:"Coastal",
       primary:"#0EA5E9", secondary:"#FFFFFF", accent:"#1E293B",
       badgeShape:"circle", badgeIcon:"wave", badgePattern:"plain", kitPattern:"plain",
       stadium:"Saltmarsh Arena", foundingYear:1909, personality:"Coastal Club", playStyle:"Counter" }),
  D2({ id:"redbridge_town", name:"Redbridge Town", shortName:"RDB", city:"Redbridge",
       primary:"#B22222", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"bridge", badgePattern:"plain", kitPattern:"plain",
       stadium:"Brookmire Stadium", foundingYear:1899, personality:"Local Underdog", playStyle:"Balanced" }),
  D2({ id:"northfield_fc", name:"Northfield FC", shortName:"NTF", city:"Northfield",
       primary:"#1A1A1A", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"bolt", badgePattern:"halves", kitPattern:"halves",
       stadium:"Northway Stadium", foundingYear:1928, personality:"Promotion Hunter", playStyle:"Attacking" }),
  D2({ id:"kingston_vale", name:"Kingston Vale", shortName:"KGV", city:"Kingston",
       primary:"#7B1FA2", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"oval", badgeIcon:"crown", badgePattern:"halves", kitPattern:"halves",
       stadium:"The Vineyard Ground", foundingYear:1907, personality:"Sleeping Giant", playStyle:"Possession" }),
  D2({ id:"ironbridge_albion", name:"Ironbridge Albion", shortName:"IRB", city:"Ironbridge",
       primary:"#3F3F3F", secondary:"#FF7900", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"bridge", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Ironbridge Ground", foundingYear:1881, personality:"Industrial Club", playStyle:"Physical" }),
  D2({ id:"greenford_rovers", name:"Greenford Rovers", shortName:"GFR", city:"Greenford",
       primary:"#1B5E20", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"tree", badgePattern:"plain", kitPattern:"plain",
       stadium:"Greenholm Park", foundingYear:1905, personality:"Local Underdog", playStyle:"Counter" }),
  D2({ id:"ashfield_athletic", name:"Ashfield Athletic", shortName:"ASF", city:"Ashfield",
       primary:"#1565C0", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"diamond", badgeIcon:"flame", badgePattern:"plain", kitPattern:"plain",
       stadium:"Ashfield Park", foundingYear:1912, personality:"Promotion Hunter", playStyle:"High Press" }),
  D2({ id:"newhaven_town", name:"Newhaven Town", shortName:"NHT", city:"Newhaven",
       primary:"#0B6E4F", secondary:"#FFFFFF", accent:"#1A1A1A",
       badgeShape:"crest", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"plain",
       stadium:"Ferryside", foundingYear:1898, personality:"Coastal Club", playStyle:"Defensive" }),
  D2({ id:"riverside_county", name:"Riverside County", shortName:"RVC", city:"Riverside",
       primary:"#0066B3", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"river", badgePattern:"plain", kitPattern:"plain",
       stadium:"Rivergate Stadium", foundingYear:1903, personality:"Local Underdog", playStyle:"Balanced" }),

  // ============== DIVISION TWO (20) ==============
  D3({ id:"aldermoor_fc", name:"Aldermoor FC", shortName:"ALM", city:"Aldermoor",
       primary:"#37474F", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"oval", badgeIcon:"stag", badgePattern:"plain", kitPattern:"plain",
       stadium:"Glenmore Park", foundingYear:1925, personality:"Working-Class Club", playStyle:"Defensive" }),
  D3({ id:"bramwell_borough", name:"Bramwell Borough", shortName:"BRA", city:"Bramwell",
       primary:"#7B1FA2", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"crown", badgePattern:"plain", kitPattern:"sleeves",
       stadium:"Crownmoor", foundingYear:1908, personality:"Sleeping Giant", playStyle:"Counter" }),
  D3({ id:"charnwood_town", name:"Charnwood Town", shortName:"CHA", city:"Charnwood",
       primary:"#FFC72C", secondary:"#1A1A1A", accent:"#FFFFFF",
       badgeShape:"diamond", badgeIcon:"flame", badgePattern:"halves", kitPattern:"halves",
       stadium:"The Gallowsfield", foundingYear:1898, personality:"Cup Fighter", playStyle:"Attacking" }),
  D3({ id:"drayfield_united", name:"Drayfield United", shortName:"DRA", city:"Drayfield",
       primary:"#0E7C3A", secondary:"#FFFFFF", accent:"#1A1A1A",
       badgeShape:"shield", badgeIcon:"horse", badgePattern:"plain", kitPattern:"plain",
       stadium:"Beacon Park", foundingYear:1923, personality:"Local Underdog", playStyle:"Balanced" }),
  D3({ id:"edenbridge_fc", name:"Edenbridge FC", shortName:"EDB", city:"Edenbridge",
       primary:"#0288D1", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"bridge", badgePattern:"hoops", kitPattern:"hoops",
       stadium:"Old Lane", foundingYear:1894, personality:"Historic Club", playStyle:"Possession" }),
  D3({ id:"foxhollow_town", name:"Foxhollow Town", shortName:"FOX", city:"Foxhollow",
       primary:"#D84315", secondary:"#FFFFFF", accent:"#1A1A1A",
       badgeShape:"shield", badgeIcon:"tree", badgePattern:"plain", kitPattern:"plain",
       stadium:"Foxford Bowl", foundingYear:1929, personality:"Working-Class Club", playStyle:"Direct" }),
  D3({ id:"greystone_athletic", name:"Greystone Athletic", shortName:"GRY", city:"Greystone",
       primary:"#455A64", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"crest", badgeIcon:"mountain", badgePattern:"plain", kitPattern:"plain",
       stadium:"Halfshire Park", foundingYear:1907, personality:"Local Underdog", playStyle:"Defensive" }),
  D3({ id:"hartwood_rangers", name:"Hartwood Rangers", shortName:"HRT", city:"Hartwood",
       primary:"#1A237E", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"stag", badgePattern:"plain", kitPattern:"plain",
       stadium:"Hatherley Stadium", foundingYear:1902, personality:"Cup Fighter", playStyle:"Counter" }),
  D3({ id:"inverleigh_fc", name:"Inverleigh FC", shortName:"INV", city:"Inverleigh",
       primary:"#0D47A1", secondary:"#FFFFFF", accent:"#FFFFFF",
       badgeShape:"oval", badgeIcon:"river", badgePattern:"plain", kitPattern:"vertical-stripes",
       stadium:"The Saltyard", foundingYear:1916, personality:"Coastal Club", playStyle:"Balanced" }),
  D3({ id:"jasperton_united", name:"Jasperton United", shortName:"JAS", city:"Jasperton",
       primary:"#6A1B9A", secondary:"#FFC107", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"falcon", badgePattern:"plain", kitPattern:"plain",
       stadium:"Jenrick Stadium", foundingYear:1934, personality:"Promotion Hunter", playStyle:"Attacking" }),
  D3({ id:"kingsford_athletic", name:"Kingsford Athletic", shortName:"KFD", city:"Kingsford",
       primary:"#212121", secondary:"#FF7900", accent:"#FFFFFF",
       badgeShape:"diamond", badgeIcon:"crown", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Kelsford Bowl", foundingYear:1921, personality:"Working-Class Club", playStyle:"Physical" }),
  D3({ id:"lockwood_town", name:"Lockwood Town", shortName:"LWD", city:"Lockwood",
       primary:"#2E7D32", secondary:"#FFFFFF", accent:"#1A1A1A",
       badgeShape:"shield", badgeIcon:"hammer", badgePattern:"plain", kitPattern:"plain",
       stadium:"Lambton Park", foundingYear:1903, personality:"Mining Town Club", playStyle:"Direct" }),
  D3({ id:"marlborough_fc", name:"Marlborough FC", shortName:"MRB", city:"Marlborough",
       primary:"#283593", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"crest", badgeIcon:"sword", badgePattern:"plain", kitPattern:"sleeves",
       stadium:"Mickleton", foundingYear:1899, personality:"Historic Club", playStyle:"Possession" }),
  D3({ id:"norfolk_vale_united", name:"Norfolk Vale United", shortName:"NVU", city:"Norfolk Vale",
       primary:"#C62828", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"rose", badgePattern:"plain", kitPattern:"plain",
       stadium:"Whitechurch", foundingYear:1893, personality:"Local Underdog", playStyle:"Balanced" }),
  D3({ id:"oakridge_town", name:"Oakridge Town", shortName:"OAK", city:"Oakridge",
       primary:"#1B5E20", secondary:"#FFEB3B", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"tree", badgePattern:"halves", kitPattern:"halves",
       stadium:"Sunley Stadium", foundingYear:1911, personality:"Local Underdog", playStyle:"Counter" }),
  D3({ id:"penbridge_united", name:"Penbridge United", shortName:"PNB", city:"Penbridge",
       primary:"#0277BD", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"oval", badgeIcon:"bridge", badgePattern:"plain", kitPattern:"plain",
       stadium:"Ashbridge Bowl", foundingYear:1906, personality:"Working-Class Club", playStyle:"Defensive" }),
  D3({ id:"quinford_rovers", name:"Quinford Rovers", shortName:"QFR", city:"Quinford",
       primary:"#4527A0", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"star", badgePattern:"plain", kitPattern:"plain",
       stadium:"Eastfields Arena", foundingYear:1910, personality:"Sleeping Giant", playStyle:"Attacking" }),
  D3({ id:"rivermouth_fc", name:"Rivermouth FC", shortName:"RVM", city:"Rivermouth",
       primary:"#0288D1", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"crest", badgeIcon:"wave", badgePattern:"stripes", kitPattern:"vertical-stripes",
       stadium:"Birchgrove Park", foundingYear:1928, personality:"Coastal Club", playStyle:"Direct" }),
  D3({ id:"selwick_borough", name:"Selwick Borough", shortName:"SWB", city:"Selwick",
       primary:"#FFA000", secondary:"#1A1A1A", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"sun", badgePattern:"plain", kitPattern:"plain",
       stadium:"Cobblefield", foundingYear:1925, personality:"Local Underdog", playStyle:"Balanced" }),
  D3({ id:"thornbury_united", name:"Thornbury United", shortName:"THB", city:"Thornbury",
       primary:"#7B1FA2", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"diamond", badgeIcon:"rose", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Galsworth Bowl", foundingYear:1916, personality:"Working-Class Club", playStyle:"Counter" }),

  // ============== DIVISION THREE (20) ==============
  D4({ id:"underbridge_fc", name:"Underbridge FC", shortName:"UND", city:"Underbridge",
       primary:"#1B1B1B", secondary:"#A0A0A0", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"bridge", badgePattern:"plain", kitPattern:"plain",
       stadium:"Furzewood", foundingYear:1947, personality:"Local Underdog", playStyle:"Defensive" }),
  D4({ id:"velmore_town", name:"Velmore Town", shortName:"VEL", city:"Velmore",
       primary:"#37474F", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"oval", badgeIcon:"mountain", badgePattern:"plain", kitPattern:"plain",
       stadium:"Verdant Park", foundingYear:1956, personality:"Local Underdog", playStyle:"Direct" }),
  D4({ id:"wexham_united", name:"Wexham United", shortName:"WEX", city:"Wexham",
       primary:"#FF6F00", secondary:"#000000", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"flame", badgePattern:"plain", kitPattern:"plain",
       stadium:"Wexham Bowl", foundingYear:1962, personality:"Promotion Hunter", playStyle:"Attacking" }),
  D4({ id:"yarmouth_vale", name:"Yarmouth Vale", shortName:"YMV", city:"Yarmouth Vale",
       primary:"#0277BD", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"oval", badgeIcon:"anchor", badgePattern:"plain", kitPattern:"vertical-stripes",
       stadium:"Headland Park", foundingYear:1944, personality:"Coastal Club", playStyle:"Balanced" }),
  D4({ id:"allerton_athletic", name:"Allerton Athletic", shortName:"ALL", city:"Allerton",
       primary:"#3949AB", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"hammer", badgePattern:"chevron", kitPattern:"sleeves",
       stadium:"The Ironway", foundingYear:1959, personality:"Working-Class Club", playStyle:"Direct" }),
  D4({ id:"belford_rangers", name:"Belford Rangers", shortName:"BLF", city:"Belford",
       primary:"#1565C0", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"falcon", badgePattern:"hoops", kitPattern:"hoops",
       stadium:"Belford Park", foundingYear:1934, personality:"Cup Fighter", playStyle:"Counter" }),
  D4({ id:"cotsworth_borough", name:"Cotsworth Borough", shortName:"CTS", city:"Cotsworth",
       primary:"#558B2F", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"horse", badgePattern:"plain", kitPattern:"plain",
       stadium:"Arden Park", foundingYear:1955, personality:"Local Underdog", playStyle:"Balanced" }),
  D4({ id:"daleford_town", name:"Daleford Town", shortName:"DAL", city:"Daleford",
       primary:"#FFA000", secondary:"#1A1A1A", accent:"#FFFFFF",
       badgeShape:"diamond", badgeIcon:"sun", badgePattern:"halves", kitPattern:"halves",
       stadium:"Drumkirk Park", foundingYear:1948, personality:"Local Underdog", playStyle:"Counter" }),
  D4({ id:"easterley_united", name:"Easterley United", shortName:"EAS", city:"Easterley",
       primary:"#C2185B", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"shield", badgeIcon:"star", badgePattern:"plain", kitPattern:"plain",
       stadium:"Old Brewery Ground", foundingYear:1937, personality:"Working-Class Club", playStyle:"High Press" }),
  D4({ id:"falkbridge_athletic", name:"Falkbridge Athletic", shortName:"FLK", city:"Falkbridge",
       primary:"#1A237E", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"falcon", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Dunfern Park", foundingYear:1951, personality:"Sleeping Giant", playStyle:"Possession" }),
  D4({ id:"greenholm_borough", name:"Greenholm Borough", shortName:"GRH", city:"Greenholm",
       primary:"#2E7D32", secondary:"#FFFFFF", accent:"#1A1A1A",
       badgeShape:"shield", badgeIcon:"tree", badgePattern:"plain", kitPattern:"plain",
       stadium:"Highstreet Lane", foundingYear:1945, personality:"Local Underdog", playStyle:"Defensive" }),
  D4({ id:"hartlebury_fc", name:"Hartlebury FC", shortName:"HBY", city:"Hartlebury",
       primary:"#5D4037", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"crest", badgeIcon:"stag", badgePattern:"plain", kitPattern:"plain",
       stadium:"St. Bryce's", foundingYear:1932, personality:"Historic Club", playStyle:"Balanced" }),
  D4({ id:"iverside_town", name:"Iverside Town", shortName:"IVR", city:"Iverside",
       primary:"#0277BD", secondary:"#FFFFFF", accent:"#000000",
       badgeShape:"oval", badgeIcon:"river", badgePattern:"plain", kitPattern:"plain",
       stadium:"Riverside Field", foundingYear:1953, personality:"Coastal Club", playStyle:"Counter" }),
  D4({ id:"joppa_rangers", name:"Joppa Rangers", shortName:"JPR", city:"Joppa",
       primary:"#283593", secondary:"#FFFFFF", accent:"#FFC72C",
       badgeShape:"shield", badgeIcon:"sword", badgePattern:"plain", kitPattern:"plain",
       stadium:"St. Wulfstan's Park", foundingYear:1940, personality:"Local Underdog", playStyle:"Defensive" }),
  D4({ id:"kelsworth_united", name:"Kelsworth United", shortName:"KSW", city:"Kelsworth",
       primary:"#0D47A1", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"shield", badgeIcon:"crown", badgePattern:"halves", kitPattern:"halves",
       stadium:"St. Mathilda's Park", foundingYear:1949, personality:"Sleeping Giant", playStyle:"Attacking" }),
  D4({ id:"lythorpe_athletic", name:"Lythorpe Athletic", shortName:"LYT", city:"Lythorpe",
       primary:"#FFC107", secondary:"#1A1A1A", accent:"#FFFFFF",
       badgeShape:"diamond", badgeIcon:"bolt", badgePattern:"diagonal", kitPattern:"diagonal",
       stadium:"Bellfield", foundingYear:1958, personality:"Local Underdog", playStyle:"High Press" }),
  D4({ id:"maybridge_town", name:"Maybridge Town", shortName:"MBT", city:"Maybridge",
       primary:"#388E3C", secondary:"#FFC72C", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"bridge", badgePattern:"plain", kitPattern:"plain",
       stadium:"Parkgate", foundingYear:1947, personality:"Local Underdog", playStyle:"Balanced" }),
  D4({ id:"newcoate_fc", name:"Newcoate FC", shortName:"NEW", city:"Newcoate",
       primary:"#212121", secondary:"#FFFFFF", accent:"#C62828",
       badgeShape:"shield", badgeIcon:"castle", badgePattern:"stripes", kitPattern:"vertical-stripes",
       stadium:"Rookery Park", foundingYear:1939, personality:"Crisis Club", playStyle:"Direct" }),
  D4({ id:"otterford_town", name:"Otterford Town", shortName:"OTT", city:"Otterford",
       primary:"#7B1FA2", secondary:"#FFFFFF", accent:"#FFD700",
       badgeShape:"oval", badgeIcon:"river", badgePattern:"plain", kitPattern:"plain",
       stadium:"Castle Lane", foundingYear:1942, personality:"Local Underdog", playStyle:"Counter" }),
  D4({ id:"penshire_athletic", name:"Penshire Athletic", shortName:"PSH", city:"Penshire",
       primary:"#37474F", secondary:"#FFC107", accent:"#FFFFFF",
       badgeShape:"shield", badgeIcon:"mountain", badgePattern:"plain", kitPattern:"plain",
       stadium:"The Old Mill", foundingYear:1944, personality:"Mining Town Club", playStyle:"Defensive" }),
];

// =====================================================================
// MULTI-NATION SEED ASSEMBLY
// The hand-crafted CLUB_SEEDS above are the English pyramid. Other
// nations are seeded procedurally from city pools — see
// `src/data/clubSeeds/cityPools.ts` and
// `src/generators/clubSeedGenerator.ts`. The procedural seeds are
// fully deterministic (same seed every run) so saves stay stable.
// =====================================================================

import { NATION_IDS } from "@/data/nations";
import {
  ITALY_CITIES,
  SPAIN_CITIES,
  GERMANY_CITIES,
  SCOTLAND_CITIES,
} from "@/data/clubSeeds/cityPools";
import {
  FRANCE_CITIES,
  NETHERLANDS_CITIES,
  BELGIUM_CITIES,
  PORTUGAL_CITIES,
  TURKEY_CITIES,
  SWEDEN_CITIES,
  NORWAY_CITIES,
  DENMARK_CITIES,
  POLAND_CITIES,
  UKRAINE_CITIES,
  CZECH_CITIES,
  GREECE_CITIES,
} from "@/data/clubSeeds/cityPoolsExtra";
import {
  generateClubSeeds,
  ITALIAN_FLAVOUR,
  SPANISH_FLAVOUR,
  GERMAN_FLAVOUR,
  SCOTTISH_FLAVOUR,
  FRENCH_FLAVOUR,
  DUTCH_FLAVOUR,
  BELGIAN_FLAVOUR,
  PORTUGUESE_FLAVOUR,
  TURKISH_FLAVOUR,
  SWEDISH_FLAVOUR,
  NORWEGIAN_FLAVOUR,
  DANISH_FLAVOUR,
  POLISH_FLAVOUR,
  UKRAINIAN_FLAVOUR,
  CZECH_FLAVOUR,
  GREEK_FLAVOUR,
} from "@/generators/clubSeedGenerator";

/** Per-nation seed list. Lazily computed once on first import. */
function buildNationSeeds(): Record<string, ClubSeed[]> {
  // English seeds default to nationId = england.
  const englishSeeds: ClubSeed[] = CLUB_SEEDS.map((s) => ({
    ...s,
    nationId: NATION_IDS.ENGLAND,
  }));
  const stamp = (nationId: string, seeds: ClubSeed[]): ClubSeed[] =>
    seeds.map((s) => ({ ...s, nationId }));
  return {
    [NATION_IDS.ENGLAND]:     englishSeeds,
    [NATION_IDS.SCOTLAND]:    stamp(NATION_IDS.SCOTLAND,    generateClubSeeds(NATION_IDS.SCOTLAND,    SCOTLAND_CITIES,    SCOTTISH_FLAVOUR)),
    [NATION_IDS.FRANCE]:      stamp(NATION_IDS.FRANCE,      generateClubSeeds(NATION_IDS.FRANCE,      FRANCE_CITIES,      FRENCH_FLAVOUR)),
    [NATION_IDS.NETHERLANDS]: stamp(NATION_IDS.NETHERLANDS, generateClubSeeds(NATION_IDS.NETHERLANDS, NETHERLANDS_CITIES, DUTCH_FLAVOUR)),
    [NATION_IDS.BELGIUM]:     stamp(NATION_IDS.BELGIUM,     generateClubSeeds(NATION_IDS.BELGIUM,     BELGIUM_CITIES,     BELGIAN_FLAVOUR)),
    [NATION_IDS.GERMANY]:     stamp(NATION_IDS.GERMANY,     generateClubSeeds(NATION_IDS.GERMANY,     GERMANY_CITIES,     GERMAN_FLAVOUR)),
    [NATION_IDS.CZECH]:       stamp(NATION_IDS.CZECH,       generateClubSeeds(NATION_IDS.CZECH,       CZECH_CITIES,       CZECH_FLAVOUR)),
    [NATION_IDS.ITALY]:       stamp(NATION_IDS.ITALY,       generateClubSeeds(NATION_IDS.ITALY,       ITALY_CITIES,       ITALIAN_FLAVOUR)),
    [NATION_IDS.SPAIN]:       stamp(NATION_IDS.SPAIN,       generateClubSeeds(NATION_IDS.SPAIN,       SPAIN_CITIES,       SPANISH_FLAVOUR)),
    [NATION_IDS.PORTUGAL]:    stamp(NATION_IDS.PORTUGAL,    generateClubSeeds(NATION_IDS.PORTUGAL,    PORTUGAL_CITIES,    PORTUGUESE_FLAVOUR)),
    [NATION_IDS.GREECE]:      stamp(NATION_IDS.GREECE,      generateClubSeeds(NATION_IDS.GREECE,      GREECE_CITIES,      GREEK_FLAVOUR)),
    [NATION_IDS.TURKEY]:      stamp(NATION_IDS.TURKEY,      generateClubSeeds(NATION_IDS.TURKEY,      TURKEY_CITIES,      TURKISH_FLAVOUR)),
    [NATION_IDS.SWEDEN]:      stamp(NATION_IDS.SWEDEN,      generateClubSeeds(NATION_IDS.SWEDEN,      SWEDEN_CITIES,      SWEDISH_FLAVOUR)),
    [NATION_IDS.NORWAY]:      stamp(NATION_IDS.NORWAY,      generateClubSeeds(NATION_IDS.NORWAY,      NORWAY_CITIES,      NORWEGIAN_FLAVOUR)),
    [NATION_IDS.DENMARK]:     stamp(NATION_IDS.DENMARK,     generateClubSeeds(NATION_IDS.DENMARK,     DENMARK_CITIES,     DANISH_FLAVOUR)),
    [NATION_IDS.POLAND]:      stamp(NATION_IDS.POLAND,      generateClubSeeds(NATION_IDS.POLAND,      POLAND_CITIES,      POLISH_FLAVOUR)),
    [NATION_IDS.UKRAINE]:     stamp(NATION_IDS.UKRAINE,     generateClubSeeds(NATION_IDS.UKRAINE,     UKRAINE_CITIES,     UKRAINIAN_FLAVOUR)),
  };
}

let _nationSeedsCache: Record<string, ClubSeed[]> | null = null;
function getNationSeeds(): Record<string, ClubSeed[]> {
  if (!_nationSeedsCache) _nationSeedsCache = buildNationSeeds();
  return _nationSeedsCache;
}

/** All ClubSeeds across every nation in the world, in a stable order
 *  (England → Italy → Spain → Germany → Scotland; tier 1 → 4 within
 *  each nation). Used by the world generator. */
export function getAllClubSeeds(): ClubSeed[] {
  const map = getNationSeeds();
  // Concatenate every registered nation's seeds in registry order.
  // We use Object.values directly so future nations are picked up
  // automatically without having to amend this list.
  return Object.values(map).flat();
}

/** Just the seeds for one nation. Used by the career picker to show
 *  the user only clubs from their chosen nation. */
export function getClubSeedsForNation(nationId: string): ClubSeed[] {
  return getNationSeeds()[nationId] ?? [];
}

// Quick sanity check helpers (used at runtime once during db build).
export function clubsByDivision(tier: 1 | 2 | 3 | 4): ClubSeed[] {
  return CLUB_SEEDS.filter((c) => c.divisionTier === tier);
}

// =====================================================================
// STRENGTH TIER — within-division pecking order, derived from personality.
// Drives squad quality, budget, reputation, stadium, and objectives so a
// division has a clear hierarchy of favourites, mid-table, and strugglers.
// =====================================================================

export type StrengthTier = "top" | "upper" | "mid" | "lower" | "bottom";

export function strengthTierFor(seed: ClubSeed): StrengthTier {
  switch (seed.personality) {
    // Title / promotion favourites — money, history, big-city pull.
    case "Big City Club":
    case "Money Club":
    case "Fallen Giant":
      return "top";

    // Strong, ambitious clubs that should fight for promotion / European spots.
    case "Sleeping Giant":
    case "Promotion Hunter":
    case "Cup Fighter":
    case "Flashy New Club":
    case "Historic Club":
      return "upper";

    // Solid mid-table clubs.
    case "Industrial Club":
    case "Working-Class Club":
    case "University Club":
    case "Port Club":
    case "Coastal Club":
    case "Railway Club":
    case "Youth Factory":
    case "Academy Club":
    case "Fan-Owned Club":
      return "mid";

    // Lower-half scrappers.
    case "Local Underdog":
      return "lower";

    // Doomed — clubs in genuine trouble.
    case "Crisis Club":
    case "Mining Town Club":
      return "bottom";

    default:
      return "mid";
  }
}

// Generic strength labels — kept around for legacy callers, but the
// preferred path is `strengthLabelFor(strength, divisionTier)` below
// because "Promotion Contender" makes no sense in the top division
// (where the parallel target is European qualification, not promotion).
export const STRENGTH_LABEL: Record<StrengthTier, string> = {
  top: "Title Favourites",
  upper: "Promotion Contender",
  mid: "Mid-Table",
  lower: "Lower-Half Battler",
  bottom: "Relegation Candidate",
};

/**
 * Pretty label for the (strength, divisionTier) pair. Differs from
 * STRENGTH_LABEL because:
 *
 *  - In the top division ("Premier") there's no promotion to chase,
 *    so the equivalent ambition tier is "European Places". The bottom
 *    of the top flight is also a serious "Relegation Battle".
 *  - In the bottom division (D3 in our four-tier pyramid) there's
 *    nowhere lower to be relegated *to*, so the bottom strength
 *    becomes a "Survival Battle" rather than relegation.
 *  - Middle divisions keep the classic promotion/relegation language.
 */
export function strengthLabelFor(
  strength: StrengthTier,
  divisionTier: 1 | 2 | 3 | 4,
): string {
  const isTopFlight = divisionTier === 1;
  const isBottomFlight = divisionTier === 4;

  switch (strength) {
    case "top":
      return "Title Favourites";
    case "upper":
      return isTopFlight ? "European Places" : "Promotion Contender";
    case "mid":
      return "Mid-Table";
    case "lower":
      // Bottom-flight "lower" clubs are still in the survival
      // conversation; everywhere else they're just lower-half scrappers.
      return isBottomFlight ? "Survival Battle" : "Lower-Half Battler";
    case "bottom":
      return isBottomFlight ? "Survival Battle" : "Relegation Battle";
  }
}

