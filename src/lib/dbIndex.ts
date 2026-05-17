// =====================================================================
// DB INDEXES — cached secondary indexes on top of the GameDatabase so
// hot paths stop iterating 30,000+ players (15 nations × 80 clubs × 25
// players) on every render.
//
// Pattern:
//   • Each helper takes the raw record / array straight from the store
//     (e.g. `db.players`).
//   • Results are cached in a WeakMap keyed by THAT record/array
//     reference. So the first call after a store mutation rebuilds
//     the index in O(N); every subsequent call inside the same
//     reference is O(1).
//   • When the store updates (transfer, new match, season rollover)
//     it produces a new record reference — the old WeakMap entry is
//     garbage collected automatically and the next access rebuilds.
//
// React-side: use `useMemo(() => playersByClub(db.players).get(id) ?? [], [db.players, id])`
// — the WeakMap means even if multiple components hit the same map
// with different ids, the underlying map is shared and built once.
// =====================================================================

import type { Fixture, Player } from "@/types/game";

// ── PLAYERS BY CLUB ───────────────────────────────────────────────

const playerByClubCache = new WeakMap<Record<string, Player>, Map<string, Player[]>>();

/** Build (or reuse) a map of clubId → Player[] for the given player
 *  registry. Returns an empty Map for nullish input. */
export function playersByClub(players: Record<string, Player> | undefined | null): Map<string, Player[]> {
  if (!players) return new Map();
  const cached = playerByClubCache.get(players);
  if (cached) return cached;
  const map = new Map<string, Player[]>();
  // Object.values() is roughly 10× faster than Object.entries here
  // because we don't need the key.
  for (const id in players) {
    const p = players[id];
    if (!p) continue;
    const list = map.get(p.clubId);
    if (list) list.push(p);
    else map.set(p.clubId, [p]);
  }
  playerByClubCache.set(players, map);
  return map;
}

/** Convenience — single-club lookup with a stable empty fallback. */
export function playersForClub(
  players: Record<string, Player> | undefined | null,
  clubId: string,
): Player[] {
  return playersByClub(players).get(clubId) ?? EMPTY_PLAYERS;
}

const EMPTY_PLAYERS: Player[] = [];

// ── FIXTURES BY CLUB ──────────────────────────────────────────────

const fixtureByClubCache = new WeakMap<Fixture[], Map<string, Fixture[]>>();

/** clubId → fixtures involving that club, in week order. */
export function fixturesByClub(fixtures: Fixture[] | undefined | null): Map<string, Fixture[]> {
  if (!fixtures) return new Map();
  const cached = fixtureByClubCache.get(fixtures);
  if (cached) return cached;
  const map = new Map<string, Fixture[]>();
  for (const fx of fixtures) {
    addToBucket(map, fx.homeId, fx);
    addToBucket(map, fx.awayId, fx);
  }
  // Sort each bucket once so consumers don't have to.
  for (const list of map.values()) {
    list.sort((a, b) => a.week - b.week);
  }
  fixtureByClubCache.set(fixtures, map);
  return map;
}

export function fixturesForClub(
  fixtures: Fixture[] | undefined | null,
  clubId: string,
): Fixture[] {
  return fixturesByClub(fixtures).get(clubId) ?? EMPTY_FIXTURES;
}

const EMPTY_FIXTURES: Fixture[] = [];

// ── FIXTURES BY COMPETITION ───────────────────────────────────────

const fixtureByCompCache = new WeakMap<Fixture[], Map<string, Fixture[]>>();

/** competitionId → fixtures in that competition, in week order. */
export function fixturesByCompetition(fixtures: Fixture[] | undefined | null): Map<string, Fixture[]> {
  if (!fixtures) return new Map();
  const cached = fixtureByCompCache.get(fixtures);
  if (cached) return cached;
  const map = new Map<string, Fixture[]>();
  for (const fx of fixtures) {
    addToBucket(map, fx.competitionId, fx);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.week - b.week);
  }
  fixtureByCompCache.set(fixtures, map);
  return map;
}

export function fixturesForCompetition(
  fixtures: Fixture[] | undefined | null,
  compId: string,
): Fixture[] {
  return fixturesByCompetition(fixtures).get(compId) ?? EMPTY_FIXTURES;
}

// ── FIXTURES BY WEEK ──────────────────────────────────────────────

const fixtureByWeekCache = new WeakMap<Fixture[], Map<number, Fixture[]>>();

/** week → fixtures scheduled that week (across every competition). */
export function fixturesByWeek(fixtures: Fixture[] | undefined | null): Map<number, Fixture[]> {
  if (!fixtures) return new Map();
  const cached = fixtureByWeekCache.get(fixtures);
  if (cached) return cached;
  const map = new Map<number, Fixture[]>();
  for (const fx of fixtures) {
    addToBucket(map, fx.week, fx);
  }
  fixtureByWeekCache.set(fixtures, map);
  return map;
}

export function fixturesForWeek(
  fixtures: Fixture[] | undefined | null,
  week: number,
): Fixture[] {
  return fixturesByWeek(fixtures).get(week) ?? EMPTY_FIXTURES;
}

// ── INTERNAL ──────────────────────────────────────────────────────

function addToBucket<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
