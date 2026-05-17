"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  getClubSeedsForNation,
  strengthLabelFor,
  strengthTierFor,
  type StrengthTier,
} from "@/data/clubSeeds";
import {
  NATIONS,
  NATION_IDS,
  REGIONS,
  divisionNameFor,
  divisionShortNameFor,
} from "@/data/nations";
import type { NationRegion } from "@/types/game";
import { TeamCrest } from "@/components/game/TeamCrest";
import { Kit } from "@/components/game/Kit";
import { NationFlag } from "@/components/game/NationFlag";
import { useGame } from "@/store/gameStore";
import { buildClubsAndPlayers } from "@/generators/teamGenerator";
import { createRng } from "@/lib/rng";
import { WORLD_SEED } from "@/data/worldSeed";
import { formatValue } from "@/lib/playerValue";
import type { Club } from "@/types/game";

const DIFFICULTY_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Easy",
  2: "Balanced",
  3: "Hard",
  4: "Legendary",
};

type Step = "nation" | "club";

export default function CareerNewPage() {
  const [step, setStep] = useState<Step>("nation");
  const [regionFilter, setRegionFilter] = useState<NationRegion | "all">("all");
  const [nationId, setNationId] = useState<string>(NATION_IDS.ENGLAND);
  const [tier, setTier] = useState<1 | 2 | 3 | 4>(2);
  const [managerName, setManagerName] = useState("");
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const startCareer = useGame((s) => s.startNewCareer);
  const router = useRouter();

  // Build the full world ONCE so previewed clubs match what
  // `startCareer` will spawn. The world is huge (5 nations × 80
  // clubs) but it's only paid for on the career-create screen, and
  // the same canonical seed makes it stable.
  const preview = useMemo(() => {
    const rng = createRng(WORLD_SEED);
    return buildClubsAndPlayers(rng);
  }, []);

  // Map of nation seeds — one per nation. Used to resolve a club's
  // strengthTier (only the seed knows that, not the generated club).
  const seedsByNation = useMemo(() => {
    const map: Record<string, ReturnType<typeof getClubSeedsForNation>> = {};
    NATIONS.forEach((n) => { map[n.id] = getClubSeedsForNation(n.id); });
    return map;
  }, []);

  const seedById = useMemo(() => {
    const map: Record<string, ReturnType<typeof getClubSeedsForNation>[number]> = {};
    Object.values(seedsByNation).flat().forEach((s) => { map[s.id] = s; });
    return map;
  }, [seedsByNation]);

  const clubsByTier = useMemo(() => {
    const map: Record<1 | 2 | 3 | 4, Club[]> = { 1: [], 2: [], 3: [], 4: [] };
    Object.values(preview.clubs).forEach((c) => {
      if (c.nationId !== nationId) return;
      const seed = seedById[c.id];
      const t = (seed?.divisionTier ?? 1) as 1 | 2 | 3 | 4;
      map[t].push(c);
    });
    const STRENGTH_ORDER: Record<StrengthTier, number> = {
      top: 0, upper: 1, mid: 2, lower: 3, bottom: 4,
    };
    (Object.keys(map) as unknown as (1 | 2 | 3 | 4)[]).forEach((k) => {
      map[k].sort((a, b) => {
        const sa = strengthTierFor(seedById[a.id]!);
        const sb = strengthTierFor(seedById[b.id]!);
        if (STRENGTH_ORDER[sa] !== STRENGTH_ORDER[sb]) {
          return STRENGTH_ORDER[sa] - STRENGTH_ORDER[sb];
        }
        return b.squadRating - a.squadRating;
      });
    });
    return map;
  }, [preview, nationId, seedById]);

  const selectedClub = selectedClubId ? preview.clubs[selectedClubId] : null;
  const selectedSquad = selectedClub
    ? Object.values(preview.players).filter((p) => p.clubId === selectedClub.id)
    : [];
  const selectedSquadValue = selectedSquad.reduce((a, p) => a + p.value, 0);
  const selectedStar = selectedSquad.length
    ? [...selectedSquad].sort((a, b) => b.overall - a.overall)[0]
    : null;
  const nation = NATIONS.find((n) => n.id === nationId)!;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedClubId(null);
  }, [tier, nationId]);

  const begin = () => {
    if (!selectedClubId || !managerName.trim()) return;
    startCareer({ managerName: managerName.trim(), clubId: selectedClubId });
    router.push("/dashboard");
  };

  // ===== NATION PICKER STEP ============================================
  if (step === "nation") {
    return (
      <div className="min-h-dvh px-3 sm:px-4 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4 mb-4">
            <Link href="/" className="btn btn-action text-xs">← Menu</Link>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <label className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-cream)]">Manager</label>
              <input
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                placeholder="e.g. Jamie Calloway"
                className="block w-full max-w-xs text-sm scoreboard"
              />
            </div>
          </div>

          <div className="panel overflow-hidden mb-3">
            <div className="panel-bar text-base sm:text-lg">Step 1 · Choose Your Nation</div>
            <div className="bg-[color:var(--ss-bg-2)] px-4 py-3 text-[12px] uppercase tracking-[0.12em] text-[color:var(--ss-cream)]">
              Pick the football pyramid you want to manage in. Every nation runs its
              own four-tier league + domestic cups. The continental Champions Cup pulls
              the top 4 from <em>every</em> nation each season.
            </div>

            {/* Region filter — like Sensible Soccer's continent picker */}
            <div className="flex flex-wrap gap-1 px-3 py-2 bg-[color:var(--ss-bg-2)] border-t border-[color:var(--ss-bar-edge)]">
              <button
                onClick={() => setRegionFilter("all")}
                className={`tab text-[10px] px-3 py-1.5 ${regionFilter === "all" ? "tab-active" : ""}`}
              >
                ALL · {NATIONS.length}
              </button>
              {REGIONS.map((r) => {
                const count = NATIONS.filter((n) => n.region === r.id).length;
                if (count === 0) return null;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRegionFilter(r.id)}
                    className={`tab text-[10px] px-3 py-1.5 ${regionFilter === r.id ? "tab-active" : ""}`}
                  >
                    {r.shortLabel.toUpperCase()} · {count}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
              {NATIONS.filter((n) => regionFilter === "all" || n.region === regionFilter)
                .map((n, i) => {
                  const selected = nationId === n.id;
                  const bg = selected
                    ? "var(--ss-row-sel)"
                    : i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)";
                  const regionLabel = REGIONS.find((r) => r.id === n.region)?.shortLabel ?? "";
                  return (
                    <button
                      key={n.id}
                      onClick={() => setNationId(n.id)}
                      className="grid grid-cols-[48px_1fr_auto] items-center gap-3 px-4 py-3 text-left text-white"
                      style={{
                        background: bg,
                        boxShadow: selected ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                      }}
                    >
                      <NationFlag nation={n} size={32} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-extrabold uppercase tracking-[0.04em] truncate flex items-center gap-2">
                          {n.name}
                          <span className="text-[8px] tracking-[0.18em] opacity-60 font-bold">
                            {regionLabel}
                          </span>
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.14em] opacity-80 truncate">
                          {n.divisionNames[0]} · {n.nationalCupName}
                        </div>
                      </div>
                      <div className="scoreboard text-[12px] font-extrabold text-[color:var(--ss-accent)]">
                        {selected ? "▶ SELECTED" : ""}
                      </div>
                    </button>
                  );
                })}
            </div>
            <div className="px-4 py-3 bg-[color:var(--ss-bg-deep)] flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--ss-cream)]">
                <span className="text-[color:var(--ss-accent)] mr-1">▸</span>
                Selected: <strong>{nation.name}</strong> · 80 clubs · 4 divisions
              </div>
              <button
                onClick={() => setStep("club")}
                className="btn btn-stat text-xs"
              >
                Next: Pick A Club ▶
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== CLUB PICKER STEP =============================================
  return (
    <div className="min-h-dvh px-3 sm:px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4 mb-4">
          <button onClick={() => setStep("nation")} className="btn btn-action text-xs">← Change Nation</button>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <label className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--ss-cream)]">Manager</label>
            <input
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="e.g. Jamie Calloway"
              className="block w-full max-w-xs text-sm scoreboard"
            />
          </div>
        </div>

        <div className="panel overflow-hidden mb-3">
          <div className="panel-bar text-base sm:text-lg flex items-center gap-2">
            <NationFlag nation={nation} size={20} />
            <span>Step 2 · Choose Your Club ({nation.name})</span>
          </div>
          <div className="bg-[color:var(--ss-bg-deep)] flex flex-wrap gap-0">
            {([1, 2, 3, 4] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`tab flex-1 ${tier === t ? "active" : ""}`}
              >
                {divisionShortNameFor(nationId, t)} · {DIFFICULTY_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
          <div className="panel overflow-hidden">
            <div className="panel-bar text-sm">Clubs in {divisionNameFor(nationId, tier)}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 max-h-[600px] overflow-auto scrollbar-thin">
              {clubsByTier[tier].map((c, i) => {
                const seed = seedById[c.id];
                const strength: StrengthTier = seed ? strengthTierFor(seed) : "mid";
                const selected = selectedClubId === c.id;
                const bg = selected
                  ? "var(--ss-row-sel)"
                  : i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)";
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClubId(c.id)}
                    className="grid grid-cols-[40px_1fr_50px] items-center gap-2 px-2.5 py-2 text-left text-white"
                    style={{
                      background: bg,
                      boxShadow: selected ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                    }}
                  >
                    <TeamCrest club={c} size={32} />
                    <div className="min-w-0">
                      <div className="text-[12px] font-extrabold uppercase tracking-[0.04em] truncate">{c.name}</div>
                      <div className="text-[9px] uppercase tracking-[0.14em] opacity-80 truncate flex items-center gap-1.5">
                        <StrengthChip tier={strength} divisionTier={tier} />
                        <span className="truncate">{c.personality}</span>
                      </div>
                    </div>
                    <div className="text-right ss-stat py-1.5 px-1">
                      <div className="scoreboard text-[15px] font-extrabold">{c.squadRating}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {selectedClub ? (
              <motion.aside
                key={selectedClub.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className="panel overflow-hidden"
              >
                <div className="panel-bar text-base">{selectedClub.name.toUpperCase()}</div>

                <div
                  className="team-hero flex items-center gap-3 px-4 py-4"
                  style={{
                    ["--team-1" as string]: selectedClub.badge.primaryColor,
                    ["--team-2" as string]: selectedClub.badge.secondaryColor,
                  }}
                >
                  <div className="relative z-[1]">
                    <TeamCrest club={selectedClub} size={64} />
                  </div>
                  <div className="relative z-[1] min-w-0">
                    <div
                      className="text-[10px] uppercase tracking-[0.16em] opacity-90 flex items-center gap-1.5"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.55)" }}
                    >
                      <NationFlag nation={nation} size={12} />
                      <span>{divisionShortNameFor(nationId, tier)} · {DIFFICULTY_LABEL[tier]} · EST {selectedClub.badge.foundingYear}</span>
                    </div>
                    <div
                      className="text-[14px] font-extrabold uppercase tracking-[0.04em] mt-0.5 truncate"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                    >
                      {selectedClub.city}
                    </div>
                    {(() => {
                      const seed = seedById[selectedClub.id];
                      const strength: StrengthTier = seed ? strengthTierFor(seed) : "mid";
                      const dt = (seed?.divisionTier ?? tier) as 1 | 2 | 3 | 4;
                      return <span className="mt-1.5 inline-block"><StrengthChip tier={strength} divisionTier={dt} /></span>;
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-0 border-t border-[color:var(--ss-bg-deep)]">
                  <Stat label="Squad" value={selectedClub.squadRating} />
                  <Stat label="Rep" value={selectedClub.reputation} alt />
                  <Stat label="Atk" value={selectedClub.attackRating} />
                  <Stat label="Mid" value={selectedClub.midfieldRating} alt />
                  <Stat label="Def" value={selectedClub.defenceRating} />
                  <Stat label="GK" value={selectedClub.goalkeeperRating} alt />
                </div>

                <div className="ss-strip text-[10px] uppercase tracking-[0.18em] text-center py-1.5 text-[color:var(--ss-cream)]">
                  Finances + Identity
                </div>
                <div className="grid grid-cols-2 gap-0">
                  <KV k="Budget" v={`£${(selectedClub.budget / 1_000_000).toFixed(1)}m`} />
                  <KV k="Wages" v={`£${(selectedClub.wageBudget / 1_000_000).toFixed(1)}m`} alt />
                  <KV k="Squad Value" v={formatValue(selectedSquadValue)} alt />
                  <KV k="Stadium Cap" v={selectedClub.stadium.capacity.toLocaleString()} />
                  <KV k="Style" v={selectedClub.playStyle} />
                  <KV k="Personality" v={selectedClub.personality} alt />
                </div>

                {selectedStar && (
                  <div
                    className="px-3 py-2 text-white text-[12px] font-bold uppercase tracking-[0.04em]"
                    style={{
                      background: "var(--ss-row)",
                      boxShadow: "inset 4px 0 0 0 var(--ss-accent)",
                    }}
                  >
                    <span className="text-[color:var(--ss-accent)]">★</span>{" "}
                    Star · {selectedStar.displayName}{" "}
                    <span className="scoreboard text-[color:var(--ss-accent)] ml-1">{selectedStar.overall}</span>
                  </div>
                )}

                <div className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
                  Kits
                </div>
                <div className="bg-[color:var(--ss-bg-2)] flex gap-3 justify-center py-3">
                  <div className="bg-[color:var(--ss-bg-deep)] p-2 flex flex-col items-center w-20">
                    <Kit kit={selectedClub.homeKit} size={56} />
                    <div className="text-[9px] mt-1 uppercase tracking-[0.14em]">Home</div>
                  </div>
                  <div className="bg-[color:var(--ss-bg-deep)] p-2 flex flex-col items-center w-20">
                    <Kit kit={selectedClub.awayKit} size={56} />
                    <div className="text-[9px] mt-1 uppercase tracking-[0.14em]">Away</div>
                  </div>
                </div>

                <div className="bg-[color:var(--ss-bar)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] font-extrabold text-center border-y border-[color:var(--ss-bar-edge)]">
                  Season Objectives
                </div>
                <ul className="divide-y divide-[color:var(--ss-bg-deep)]">
                  {selectedClub.seasonObjectives.map((o, i) => (
                    <li
                      key={i}
                      className="px-3 py-1.5 text-white font-bold uppercase tracking-[0.04em] text-[11px]"
                      style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                    >
                      <span className="text-[color:var(--ss-accent)] mr-2">▸</span>{o}
                    </li>
                  ))}
                </ul>

                <button
                  className="btn btn-stat !rounded-none w-full h-14 border-0 text-base"
                  disabled={!managerName.trim()}
                  onClick={begin}
                >
                  {!managerName.trim() ? "Enter Manager Name" : "▶ Take The Job"}
                </button>
              </motion.aside>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="panel overflow-hidden"
              >
                <div className="panel-bar text-base">Choose a Club</div>
                <div className="bg-[color:var(--ss-bg-2)] py-12 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
                  Pick a club to view their profile.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, alt }: { label: string; value: number; alt?: boolean }) {
  return (
    <div className="px-3 py-3 text-center" style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{label}</div>
      <div className="scoreboard text-2xl font-extrabold mt-1 text-white">{value}</div>
    </div>
  );
}

function KV({ k, v, alt }: { k: string; v: string | number; alt?: boolean }) {
  return (
    <div className="px-3 py-2" style={{ background: alt ? "var(--ss-strip)" : "var(--ss-bg-2)" }}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">{k}</div>
      <div className="font-bold text-sm truncate text-white uppercase tracking-[0.04em]">{v}</div>
    </div>
  );
}

const STRENGTH_CHIP_STYLE: Record<StrengthTier, { bg: string; fg: string }> = {
  top:    { bg: "#FFD000", fg: "#0A0A0A" },
  upper:  { bg: "#5FB3E8", fg: "#0A0A0A" },
  mid:    { bg: "#9AF09A", fg: "#0A0A0A" },
  lower:  { bg: "#FF8A1A", fg: "#0A0A0A" },
  bottom: { bg: "#E83A3A", fg: "#FFFFFF" },
};

function StrengthChip({
  tier,
  divisionTier,
}: {
  tier: StrengthTier;
  divisionTier: 1 | 2 | 3 | 4;
}) {
  const s = STRENGTH_CHIP_STYLE[tier];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em]"
      style={{ background: s.bg, color: s.fg }}
    >
      {strengthLabelFor(tier, divisionTier)}
    </span>
  );
}
