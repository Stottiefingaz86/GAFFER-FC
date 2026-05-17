// =====================================================================
// CITY POOLS for procedural club seed generation.
//
// Each entry is a list of fictional-but-recognisable cities for a
// nation, used by `src/generators/clubSeedGenerator.ts` to spawn 80
// clubs spread across that nation's four divisions. The names lean
// real-flavour (mirroring the existing English seeds — "Brighton Pier
// FC" rather than fully invented strings) so the world feels like a
// plausible football map without using any real club's name.
//
// 80 cities per nation = 20 per tier. Order matters: the generator
// distributes the FIRST 20 to the top division, next 20 to D1, etc.,
// so we list the larger / more famous-feeling cities first to match
// the tier hierarchy.
// =====================================================================

export const ITALY_CITIES: string[] = [
  // Tier 1 (top flight) — biggest, most famous
  "Romana", "Milana", "Napola", "Torina", "Fiorentina", "Genoesia", "Bolognia", "Veronia",
  "Bergama", "Lazia", "Atalanta Verde", "Empolio", "Salernitana", "Udinia", "Lecceto", "Cagliara",
  "Sassuoli", "Spezzia", "Cremona", "Frosino",
  // Tier 2
  "Parma Vale", "Pisana", "Riminetta", "Modenia", "Brescia", "Reggia", "Ascolia", "Avellino",
  "Bari Sud", "Catanzaria", "Cosenza", "Vicenzia", "Pordenone", "Cittadella", "Alessandria",
  "Como Lago", "Benevenuto", "Crotonia", "Ternana", "Vibonia",
  // Tier 3
  "Lucchese", "Pistoia", "Forli", "Cesena", "Tarento", "Foggia", "Andria Norte", "Trapani",
  "Messina", "Catanella", "Padova", "Treviso", "Mantova", "Carrara", "Pescara", "Teramo",
  "Pratoia", "Siracusa", "Albenga", "Ravenna",
  // Tier 4
  "Asti", "Novara", "Sondrio", "Imperia", "Savona", "Latina", "Viterbo", "Frosinato",
  "Olbia", "Sassari", "Nuoro", "Caltanissetta", "Agrigento", "Enna Hills", "Ragusina", "Matera",
  "Potenza", "Lamezia", "Locri", "Reggio Sud",
];

export const SPAIN_CITIES: string[] = [
  // Tier 1
  "Madrida", "Barcina", "Sevillia", "Valenza", "Bilbaina", "Atletika Madrida", "Realon",
  "Vigosa", "Villarealia", "Granadilla", "Mallorquena", "Malagana", "Betico", "Espanyola",
  "Osasuna Norte", "Cadizia", "Almeria Sur", "Getafenza", "Elcheia", "Levanto",
  // Tier 2
  "Zaragozia", "Vallecano", "Santanderia", "Oviedo", "Tenerife", "Sportiva Gijón", "Albacete",
  "Burgosa", "Cartagenita", "Eibarra", "Hueltava", "Logronesia", "Lugonza", "Mirandilla",
  "Ponferradina", "Real Lerida", "Sabadelia", "Tarragonia", "Talaverra", "Castellónia",
  // Tier 3
  "Linaresia", "Murciana", "Numancia", "Ourense Verde", "Pontevedra", "Realon B", "Rayo Sud",
  "Recreativo", "Salamanca Real", "Sanlúcar", "Segoviana", "Simba Cádiz", "Toledana", "Torremolinos",
  "Ucam Sur", "Unión Estepa", "Utrera", "Valdivia Norte", "Yeclano", "Zamora Castilla",
  // Tier 4
  "Almansa", "Aragones", "Astorgana", "Betisia", "Brisa Almería", "Calahorra", "Coria", "Cruces",
  "Don Benito", "El Ejido", "Estepona Vale", "Extremadura", "Gernika", "Igualada", "Jaénia",
  "Lealtad Norte", "Manchego", "Marbella", "Pinatar", "San Roque",
];

export const GERMANY_CITIES: string[] = [
  // Tier 1
  "Münchenia", "Berlina", "Dortmunde", "Leipzigia", "Frankfurta", "Stuttgartia", "Leverkusenia",
  "Bremensen", "Hamburgia", "Köln Heim", "Wolfsburgia", "Mönchen", "Augsburga", "Fürth-Nord",
  "Mainzer", "Hoffenheim Vale", "Hannoveria", "Schalkia", "Bochuma", "Heidenheim",
  // Tier 2
  "Düsseldorfer", "Karlsruhe", "Magdeburgia", "Paderbornia", "Hansa Rostock", "Sandhausen", "Kielia",
  "Nürnbergia", "Greuther Fürth Sud", "Holstein", "Braunschweig", "Aue Vale", "Sankt Pauli", "Heideberg",
  "Fortuna Köln", "Ingolstadt", "Kaiserslautern", "Regensburgia", "Würzburg", "Darmstadtia",
  // Tier 3
  "Bayreuth", "Bielefeld", "Chemnitzia", "Dresden", "Erfurta", "Halle", "Jenaia", "Kasselia",
  "Mannheim", "Münsteria", "Offenbacher", "Osnabrücker", "Saarbrücken", "Trier Süd", "Ulmer",
  "Wattenscheid", "Wiesbadenia", "Zwickauer", "Aachener", "Cottbus",
  // Tier 4
  "Ahlen", "Bonn Rhein", "Coburg", "Detmold", "Emden", "Friedberg", "Gelsenkirchen Sud", "Hamm",
  "Iserlohn", "Jever", "Kempten", "Lübecken", "Mülheim", "Neuss", "Ottweiler", "Plauen",
  "Quakenbrück", "Reutlingen", "Speyer", "Tübingen",
];

export const SCOTLAND_CITIES: string[] = [
  // Tier 1
  "Glasgowa", "Edinburga", "Aberdene", "Hibernian Sud", "Hearts of Caledonia", "Dundee Tay",
  "Dundee Vale", "Motherwellia", "Kilmarnia", "St Mirran", "Livingstona", "Ross Highland",
  "Inverness Caley", "St Johns Pertha", "Falkirkia", "Greenock Mors", "Stranraer", "Stirling Albion",
  "Airdrieonian", "Dunfermline Athletic",
  // Tier 2
  "Ayr Borough", "Partick Thistlea", "Queens Sud", "Raith Rovers", "Arbroath", "Cove Rangers",
  "Hamilton Western", "Alloa Athletic", "Forfar", "Montrose", "Peterhead Bay", "Brechin Vale",
  "Annan Athletic", "Stenhousemuir", "Albion Rovers", "Clyde Banks", "East Fife", "Elgin City",
  "Berwick Borders", "Cowdenbeath",
  // Tier 3
  "Stranraer Bay", "Dumbarton Rock", "Morton Sud", "Dunbar", "North Inverness", "South Lanarkshire",
  "Banff Bay", "Buckie Highland", "Caledonian Sud", "Clachnacuddin", "Dudhope Town", "Fortrose",
  "Forres Mechanics", "Fraserburgh", "Galston Town", "Huntly Bay", "Inverurie Loco", "Keith Vale",
  "Lossiemouth", "Nairn Norte",
  // Tier 4
  "Aberlour", "Auchinleck Talbot", "Beith Juniors", "Cumnock", "East Stirlingshire", "Edinburgh Cit",
  "Fauldhouse Vale", "Girvan Bay", "Glenafton", "Gretna", "Largs Thistle", "Linlithgow Rose",
  "Maryhill", "Newtongrange", "Penicuik Athletic", "Pollok Borough", "Renfrew", "Spartans North",
  "Talbot Vale", "Whitehill Welfare",
];
