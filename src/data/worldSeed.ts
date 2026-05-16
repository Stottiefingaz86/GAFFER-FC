// =====================================================================
// WORLD SEED — the canonical seed for the procedurally-generated game
// world (clubs, players, fixtures, regen pool).
//
// Locking this to a fixed value means every new career starts from the
// SAME baseline. Liverpool Mersey always begins with the same 25-man
// squad. Tottenham Cockerels always has the same captain. The
// wonderkid hunt every save targets the same names. This is what
// players expect when they pick a club: "I'm taking over Liverpool"
// should mean a known, repeatable starting point — not a randomised
// roster that swaps everyone out between sessions.
//
// Per-career randomness (form drift, weekly match RNG, AI transfer
// decisions, etc.) is still keyed off `career.id`, so two managers
// taking over the same club will see *the same starting squad* but
// will then diverge as their weekly RNG forks differently. This is
// the correct split.
//
// The `-vN` suffix is an intentional invalidation hook: if we ship a
// roster-rebalancing patch (different age curves, retuned wonderkid
// distribution, new club seeds, …) and want everyone's *new* careers
// to pick up the new world, we bump the version. Old saves keep
// working because they store the seed inside the save file, not
// re-derive it.
// =====================================================================

export const WORLD_SEED = "gaffer-fc-world-v1";
