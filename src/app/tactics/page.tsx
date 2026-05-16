"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import {
  Pitch,
  PITCH_DT_TYPE,
  encodeDragPayload,
  type DragSource,
} from "@/components/game/Pitch";
import { FormationCard } from "@/components/game/FormationCard";
import { PlayerProfile } from "@/components/game/PlayerProfile";
import { PlayerStatPopover } from "@/components/game/PlayerStatPopover";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { FORMATIONS, FORMATION_KEYS, detailedToBroad } from "@/data/formations";
import type {
  DetailedPosition,
  FormationKey,
  Player,
  PlayerRole,
  Tactic,
} from "@/types/game";
import { formatValue } from "@/lib/playerValue";
import { playSfx } from "@/lib/sound";

// =====================================================================
// TACTIC CATALOGUE — single source of truth for the tactic board UI.
// `glyph`     · single-character text symbol shown on the card
// `blurb`     · one-liner that appears under the name
// `atk/def/press/tempo` · 1-5 intensity pips for the mini-bars at the
//                         bottom of each card. Purely cosmetic — the
//                         match engine reads its own TACTIC_MOD.
// Order in this array drives left→right reading order in the grid:
// most defensive on the top-left, most aggressive bottom-right.
// =====================================================================
type TacticPip = 1 | 2 | 3 | 4 | 5;
interface TacticMeta {
  id: Tactic;
  glyph: string;
  blurb: string;
  atk: TacticPip;
  def: TacticPip;
  press: TacticPip;
  tempo: TacticPip;
}
const TACTIC_CATALOGUE: TacticMeta[] = [
  { id: "Park the Bus", glyph: "▬",  blurb: "Eleven men behind the ball.",        atk: 1, def: 5, press: 1, tempo: 1 },
  { id: "Defensive",    glyph: "▼",  blurb: "Sit deep, stay compact.",            atk: 1, def: 5, press: 2, tempo: 2 },
  { id: "Counter",      glyph: "↺",  blurb: "Absorb pressure, hit on the break.", atk: 4, def: 4, press: 2, tempo: 5 },
  { id: "Balanced",     glyph: "═",  blurb: "No-frills, all-round shape.",        atk: 3, def: 3, press: 3, tempo: 3 },
  { id: "Possession",   glyph: "◉",  blurb: "Patient build, control tempo.",      atk: 4, def: 4, press: 3, tempo: 2 },
  { id: "Tiki-Taka",    glyph: "∞",  blurb: "Short triangles, smother midfield.", atk: 4, def: 4, press: 4, tempo: 1 },
  { id: "Wing Play",    glyph: "↔",  blurb: "Stretch wide, deliver crosses.",     atk: 4, def: 3, press: 3, tempo: 4 },
  { id: "Direct",       glyph: "→",  blurb: "Quick vertical passes.",             atk: 4, def: 3, press: 3, tempo: 4 },
  { id: "Long Ball",    glyph: "↗",  blurb: "Bypass midfield, hit the channels.", atk: 4, def: 3, press: 3, tempo: 3 },
  { id: "Attacking",    glyph: "▲",  blurb: "Push numbers forward.",              atk: 5, def: 2, press: 3, tempo: 4 },
  { id: "High Press",   glyph: "↟",  blurb: "Hunt the ball in their half.",       atk: 4, def: 3, press: 5, tempo: 4 },
  { id: "Gegenpress",   glyph: "↯",  blurb: "Win the ball back instantly.",       atk: 5, def: 3, press: 5, tempo: 5 },
];

/** Tiny SVG-ish glyph showing the player dots for a formation key.
 *  Used inside the closed PickerButton chip so the user can see at a
 *  glance which shape they currently have selected without opening
 *  the modal. Reuses FORMATIONS data (no separate truth source). */
function FormationGlyph({ fk }: { fk: FormationKey }) {
  const f = FORMATIONS[fk];
  return (
    <div
      className="relative w-9 h-7 rounded-sm shrink-0"
      style={{ background: "var(--pitch-2)" }}
      aria-hidden
    >
      <span
        className="absolute left-0 right-0 top-1/2 h-px bg-white/40"
      />
      {f.slots.map((s) => (
        <span
          key={s.id}
          className="absolute size-1 rounded-full -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${s.x * 100}%`,
            top: `${(1 - s.y) * 100}%`,
            background: s.position === "GK" ? "#FFD000" : "#FFFFFF",
          }}
        />
      ))}
    </div>
  );
}

/** Compact button shown in the tactics strip. Looks like a chunky chip
 *  with a leading glyph, a label/value pair and a hint. Clicking opens
 *  the corresponding picker modal. The pitch sits immediately below
 *  this strip so we keep total height tight (~64px). */
function PickerButton({
  label,
  value,
  hint,
  glyph,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  glyph: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 px-3 py-2 text-left bg-[color:var(--ss-bg-2)] hover:bg-[color:var(--ss-bg-3)] transition-colors w-full"
      aria-label={`Change ${label}`}
    >
      <span className="shrink-0">{glyph}</span>
      <span className="flex-1 min-w-0 flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold text-white/55">
          {label}
        </span>
        <span
          className="text-[14px] font-extrabold tracking-[0.04em] truncate text-[color:var(--ss-accent)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </span>
        {hint ? (
          <span className="text-[10px] text-white/55 truncate">{hint}</span>
        ) : null}
      </span>
      <span
        className="shrink-0 text-[10px] uppercase tracking-[0.16em] font-extrabold px-1.5 py-1 rounded-sm border border-[color:var(--ss-bar-edge)] bg-[color:var(--ss-bg-strip)] text-white/80 group-hover:text-white"
      >
        Change
      </span>
    </button>
  );
}

/** Modal scaffolding shared by the formation and tactic pickers.
 *  Renders a full-screen scrim with a centred panel; the children
 *  fill the body. Closes on backdrop click, ESC, or the close button.
 *  We mount this as a sibling of the page content so it can sit above
 *  every other tactics-screen element including the pitch. */
function PickerModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-2 sm:p-6 bg-black/70 backdrop-blur-sm overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="panel w-full max-w-3xl my-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="panel-bar flex items-center justify-between gap-2">
          <span className="truncate">{title}</span>
          <button
            type="button"
            className="btn btn-ghost text-xs px-2 py-1"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {subtitle ? (
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] font-extrabold border-b border-[color:var(--ss-bar-edge)]">
            {subtitle}
          </div>
        ) : null}
        <div className="bg-[color:var(--ss-bg-deep)]">{children}</div>
      </div>
    </div>
  );
}

/** FM-style card for a single tactic. Shows glyph, name, blurb and 4
 *  intensity bars (atk/def/press/tempo). The active card highlights
 *  with the accent border so the current selection reads at a glance. */
function TacticCard({
  meta,
  active,
  onClick,
}: {
  meta: TacticMeta;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${meta.id} — ${meta.blurb}`}
      className={[
        "group relative flex flex-col items-stretch gap-1 px-2 py-2 text-left transition-colors",
        "border-r border-b border-[color:var(--ss-bg-deep)] last:border-r-0",
        active
          ? "bg-[color:var(--ss-accent)] text-[color:var(--ss-bg-deep)]"
          : "bg-[color:var(--ss-bg-2)] hover:bg-[color:var(--ss-bg-3)] text-white",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2 leading-none">
        <span
          className={[
            "scoreboard text-[18px] tabular-nums",
            active ? "text-[color:var(--ss-bg-deep)]" : "text-[color:var(--ss-accent)]",
          ].join(" ")}
        >
          {meta.glyph}
        </span>
        <span className="font-extrabold text-[12px] uppercase tracking-[0.10em] truncate">
          {meta.id}
        </span>
      </div>
      <div className={[
        "text-[10px] leading-tight",
        active ? "text-[color:var(--ss-bg-deep)] opacity-80" : "text-white/70",
      ].join(" ")}>
        {meta.blurb}
      </div>
      <div className="flex items-center justify-between gap-1 mt-1">
        <TacticPipsLabel label="ATK" value={meta.atk} active={active} />
        <TacticPipsLabel label="DEF" value={meta.def} active={active} />
        <TacticPipsLabel label="PRS" value={meta.press} active={active} />
        <TacticPipsLabel label="TMP" value={meta.tempo} active={active} />
      </div>
    </button>
  );
}

function TacticPipsLabel({
  label,
  value,
  active,
}: {
  label: string;
  value: TacticPip;
  active: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={[
        "text-[8px] uppercase tracking-[0.1em] font-extrabold",
        active ? "text-[color:var(--ss-bg-deep)] opacity-70" : "text-white/50",
      ].join(" ")}>
        {label}
      </span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const lit = n <= value;
          return (
            <span
              key={n}
              className={[
                "block w-1 h-2 rounded-[1px]",
                lit
                  ? active
                    ? "bg-[color:var(--ss-bg-deep)]"
                    : "bg-[color:var(--ss-accent)]"
                  : active
                    ? "bg-[color:var(--ss-bg-deep)] opacity-25"
                    : "bg-white/15",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Maximum number of named subs allowed on the bench. SS-style 6. */
const BENCH_CAP = 6;

type SortKey = "overall" | "form" | "fitness" | "value" | "age";

export default function TacticsPage() {
  return (
    <AppShell>
      <TacticsInner />
    </AppShell>
  );
}

function TacticsInner() {
  // ── Reactive subscriptions ─────────────────────────────────────────
  // We deliberately subscribe to the underlying records here rather
  // than the getter functions on the store. `useGame((s) => s.getX)`
  // returns a stable function reference, which means the component
  // never re-renders when the data inside the store changes — every
  // swap would silently apply to the store and the UI would stay
  // frozen until you navigated away and came back. Subscribing to
  // `db.lineups` and `db.players` directly forces a re-render on the
  // exact mutations we care about (lineup updates, transfers, etc.).
  const career = useGame((s) => s.career);
  const lineupsMap = useGame((s) => s.db?.lineups);
  const playersMap = useGame((s) => s.db?.players);
  const allClubs = useGame((s) => s.db?.clubs ?? {});
  const setUserLineup = useGame((s) => s.setUserLineup);
  const setUserFormation = useGame((s) => s.setUserFormation);
  const setUserTactic = useGame((s) => s.setUserTactic);
  const setSlotRole = useGame((s) => s.setSlotRole);
  const setSlotPosition = useGame((s) => s.setSlotPosition);

  // Derive the user-specific slices once per record change. We keep
  // these as memos so identity is stable for downstream effects.
  const userClub = useMemo(
    () => (career && allClubs ? allClubs[career.selectedClubId] ?? null : null),
    [career, allClubs],
  );
  const lineup = useMemo(
    () =>
      career && lineupsMap ? lineupsMap[career.selectedClubId] ?? null : null,
    [career, lineupsMap],
  );
  const players = useMemo(
    () =>
      career && playersMap
        ? Object.values(playersMap).filter(
            (p) => p.clubId === career.selectedClubId,
          )
        : [],
    [career, playersMap],
  );

  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  // Tactics board pickers — closed by default so the pitch is the
  // headline visual on this screen. The user pops them open from the
  // chip strip just below the panel header.
  const [picker, setPicker] = useState<null | "formation" | "tactic">(null);
  // Quick-stats popover anchored to a player's pitch token / row.
  const [popover, setPopover] = useState<{
    playerId: string;
    slotPosition?: DetailedPosition;
    anchor: DOMRect | null;
  } | null>(null);
  // When set, the user expanded the popover into the full profile panel.
  const [showFullProfile, setShowFullProfile] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [benchHover, setBenchHover] = useState(false);

  const playersById = useMemo<Record<string, Player>>(
    () => Object.fromEntries(players.map((p) => [p.id, p])),
    [players],
  );

  // ESC clears any selection — global keyboard shortcut.
  // Must run before any early return so hook order is stable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close the picker first if it's open, otherwise clear selection.
      setPicker((p) => (p ? null : p));
      setSelectedSlot(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!lineup || !userClub) return null;

  const formation = FORMATIONS[lineup.formationKey];
  const startersById = lineup.starters;
  const benchIds = lineup.bench;

  const usedSet = new Set([...Object.values(startersById), ...benchIds]);
  const reserves = players
    .filter((p) => !usedSet.has(p.id))
    .sort((a, b) => sortBy(a, b, sortKey));

  // Apply per-slot position overrides so the rest of the page (squad
  // list, warnings, badges) all read the SAME position as the pitch
  // shows after a drag-to-reposition.
  const slotPositions = lineup.slotPositions ?? {};
  const startersList = formation.slots.map((s) => {
    const override = slotPositions[s.id];
    const effectivePosition = override?.position ?? s.position;
    return {
      slot: s,
      effectivePosition,
      player: playersById[startersById[s.id]] ?? null,
    };
  });
  const filledStarters = startersList.filter((s) => s.player).length;
  const teamOvr = filledStarters
    ? Math.round(startersList.reduce((a, s) => a + (s.player?.overall ?? 0), 0) / formation.slots.length)
    : 0;

  // ---- ACTIONS -------------------------------------------------------
  const swapSlots = (a: string, b: string) => {
    if (a === b) return;
    const next = { ...startersById };
    const pa = next[a];
    const pb = next[b];
    if (pa) next[b] = pa; else delete next[b];
    if (pb) next[a] = pb; else delete next[a];
    setUserLineup({ ...lineup, starters: next });
    playSfx("swap");
  };

  const benchSlot = (slotId: string) => {
    const occ = startersById[slotId];
    if (!occ) return;
    const p = playersById[occ];
    const next = { ...startersById };
    delete next[slotId];
    const newBench = benchIds.includes(occ) ? benchIds : [...benchIds, occ].slice(0, BENCH_CAP);
    setUserLineup({ ...lineup, starters: next, bench: newBench });
    if (p) toast(`${p.lastName} → bench`, "info");
    playSfx("swap");
  };

  const assignToSlot = (slotId: string, playerId: string) => {
    const next = { ...startersById };
    const displaced = next[slotId]; // current occupant of target slot
    for (const k of Object.keys(next)) {
      if (next[k] === playerId) delete next[k];
    }
    next[slotId] = playerId;

    // Bench logic — if we replaced someone, push them to bench (replacing
    // the current source position if the source was bench).
    let newBench = benchIds.filter((id) => id !== playerId);
    if (displaced && displaced !== playerId) {
      newBench = newBench.includes(displaced) ? newBench : [...newBench, displaced].slice(0, BENCH_CAP);
    }
    setUserLineup({ ...lineup, starters: next, bench: newBench });
    const p = playersById[playerId];
    if (p) toast(`${p.lastName} assigned`, "success");
    playSfx("swap");
  };

  const moveToBench = (playerId: string) => {
    const next = { ...startersById };
    for (const k of Object.keys(next)) {
      if (next[k] === playerId) delete next[k];
    }
    const newBench = benchIds.includes(playerId) ? benchIds : [...benchIds, playerId].slice(0, BENCH_CAP);
    setUserLineup({ ...lineup, starters: next, bench: newBench });
    const p = playersById[playerId];
    if (p) toast(`${p.lastName} → bench`, "info");
    playSfx("swap");
  };

  const removeFromSquad = (playerId: string) => {
    const next = { ...startersById };
    for (const k of Object.keys(next)) {
      if (next[k] === playerId) delete next[k];
    }
    const newBench = benchIds.filter((id) => id !== playerId);
    setUserLineup({ ...lineup, starters: next, bench: newBench });
    const p = playersById[playerId];
    if (p) toast(`${p.lastName} → reserves`, "warn");
  };

  // Bench reorder (sub priority): move id to position 'index'
  const reorderBench = (id: string, index: number) => {
    const list = benchIds.filter((x) => x !== id);
    const clamped = Math.max(0, Math.min(list.length, index));
    list.splice(clamped, 0, id);
    setUserLineup({ ...lineup, bench: list });
  };

  // ---- DRAG DISPATCH (from Pitch) ------------------------------------
  const handleDropOnSlot = (target: string, src: DragSource) => {
    if (src.kind === "slot") {
      swapSlots(src.slotId, target);
    } else {
      assignToSlot(target, src.playerId);
    }
  };

  const handleDropOffPitch = (src: DragSource) => {
    if (src.kind === "slot") {
      benchSlot(src.slotId);
    }
  };

  /** Click a player on the LIST: if a slot is selected, treat the
   * click as "fill that slot with this player". Otherwise, open the
   * compact stat popover anchored to the row that was clicked. */
  const handlePlayerPick = (playerId: string, anchor?: DOMRect | null) => {
    if (selectedSlot) {
      assignToSlot(selectedSlot, playerId);
      setSelectedSlot(null);
      return;
    }
    setActivePlayerId(playerId);
    setShowFullProfile(false);
    setPopover({ playerId, anchor: anchor ?? null });
  };

  const handleAutoPick = () => {
    const sorted = [...players]
      .filter((p) => !p.isInjured && !p.isSuspended)
      .sort((a, b) => b.overall - a.overall);
    const newStarters: Record<string, string> = {};
    const used = new Set<string>();
    formation.slots.forEach((slot) => {
      const broad = detailedToBroad(slot.position);
      const exact = sorted.find((p) => !used.has(p.id) && p.detailedPosition === slot.position);
      const broadMatch = exact ?? sorted.find((p) => !used.has(p.id) && p.position === broad);
      const fallback = broadMatch ?? sorted.find((p) => !used.has(p.id));
      if (fallback) {
        newStarters[slot.id] = fallback.id;
        used.add(fallback.id);
      }
    });
    const newBench = sorted.filter((p) => !used.has(p.id)).slice(0, BENCH_CAP).map((p) => p.id);
    const newCaptain = sorted
      .filter((p) => used.has(p.id))
      .sort((a, b) => b.mentality - a.mentality)[0]?.id ?? null;
    setUserLineup({ ...lineup, starters: newStarters, bench: newBench, captainId: newCaptain });
    setSelectedSlot(null);
    toast("Best XI auto-picked", "success");
  };

  const handleSelectSlot = (
    slotId: string | null,
    anchor?: DOMRect | null,
  ) => {
    setSelectedSlot(slotId);
    if (slotId) {
      const occ = startersById[slotId];
      if (occ) {
        setActivePlayerId(occ);
        const slot = formation.slots.find((s) => s.id === slotId);
        // Use the live (possibly drag-overridden) position so the
        // popover header reflects what the user sees on the pitch.
        const positionForPopover =
          (slotPositions[slotId]?.position) ?? slot?.position;
        // Open the quick-stats popover anchored to this token.
        setShowFullProfile(false);
        setPopover({
          playerId: occ,
          slotPosition: positionForPopover,
          anchor: anchor ?? null,
        });
      } else {
        setPopover(null);
      }
    } else {
      setPopover(null);
    }
  };

  /** One-click "sub in" from a bench/reserve row. If the user has a slot
   * selected, fill that slot with this player. Otherwise look for the
   * best-matching starter (same detailed position → same broad position
   * → lowest-rated starter) and swap the bench player in. */
  const handleQuickSubIn = (playerId: string) => {
    if (selectedSlot) {
      assignToSlot(selectedSlot, playerId);
      setSelectedSlot(null);
      return;
    }
    const sub = playersById[playerId];
    if (!sub) return;
    // sub.position is already the broad position (GK / DEF / MID / FWD).
    const candidates = startersList.filter((s) => s.player);
    // 1) exact detailed-position match
    let target = candidates.find((s) => s.player!.detailedPosition === sub.detailedPosition);
    // 2) broad-position match
    if (!target) target = candidates.find((s) => detailedToBroad(s.slot.position) === sub.position);
    // 3) lowest-rated starter
    if (!target) {
      target = [...candidates].sort((a, b) => (a.player!.overall) - (b.player!.overall))[0];
    }
    if (!target) {
      toast("No starter to swap with", "warn");
      return;
    }
    assignToSlot(target.slot.id, playerId);
    toast(`${target.player!.lastName} ⇄ ${sub.lastName}`, "success");
  };

  const activePlayer = activePlayerId ? playersById[activePlayerId] : null;
  const selectedSlotMeta = selectedSlot
    ? formation.slots.find((s) => s.id === selectedSlot) ?? null
    : null;
  const selectedSlotPlayer = selectedSlot
    ? playersById[startersById[selectedSlot] ?? ""] ?? null
    : null;

  // Warnings
  const warnings: string[] = [];
  if (filledStarters !== formation.slots.length) {
    warnings.push(`${filledStarters}/${formation.slots.length} starters`);
  }
  startersList.forEach(({ effectivePosition, player }) => {
    if (!player) return;
    const broad = detailedToBroad(effectivePosition);
    if (player.position !== broad) warnings.push(`${player.lastName} out of pos`);
    if (player.isInjured) warnings.push(`${player.lastName} INJURED`);
    if (player.isSuspended) warnings.push(`${player.lastName} SUSPENDED`);
    if (player.fitness < 60) warnings.push(`${player.lastName} fitness ${player.fitness}%`);
  });
  if (!lineup.captainId) warnings.push("No captain");

  // Shape coherence — mirrors the match engine's coverage / cluster
  // penalties so the user sees, before kick-off, exactly what the
  // engine will punish (empty flanks, gaps in defensive third,
  // overlapping players). Without this, a chaos shape that "wins
  // anyway" because of a roll feels free of consequence.
  {
    const def = { l: 0, c: 0, r: 0 };
    const atk = { l: 0, c: 0, r: 0 };
    const points: Array<{ x: number; y: number; name: string }> = [];
    startersList.forEach(({ slot, player }) => {
      if (!player) return;
      const override = slotPositions[slot.id];
      const x = override?.x ?? slot.x;
      const y = override?.y ?? slot.y;
      const slotPos = override?.position ?? slot.position;
      if (slotPos === "GK") return;
      const lane: "l" | "c" | "r" = x < 0.33 ? "l" : x > 0.66 ? "r" : "c";
      if (y < 0.4) def[lane] += 1;
      else if (y > 0.6) atk[lane] += 1;
      points.push({ x, y, name: player.lastName });
    });
    if (def.l === 0) warnings.push("No defensive cover left flank");
    if (def.r === 0) warnings.push("No defensive cover right flank");
    if (def.c === 0) warnings.push("No central defenders");
    if (atk.l === 0) warnings.push("No attacking width left");
    if (atk.r === 0) warnings.push("No attacking width right");
    if (atk.c === 0) warnings.push("No central attacking threat");
    const dImbalance = Math.abs(def.l - def.r);
    if (dImbalance >= 2) warnings.push(`Defence skewed ${def.l > def.r ? "left" : "right"} (${def.l}-${def.r})`);
    let clusters = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        if (Math.hypot(dx, dy) < 0.10) clusters += 1;
      }
    }
    if (clusters > 0) warnings.push(`${clusters} player overlap${clusters === 1 ? "" : "s"} on pitch`);
  }

  // Drop handler for the bench list area (drop-from-pitch → bench).
  const onBenchListDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(PITCH_DT_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setBenchHover(true);
    }
  };
  const onBenchListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setBenchHover(false);
    try {
      const src = JSON.parse(e.dataTransfer.getData(PITCH_DT_TYPE)) as DragSource;
      if (src.kind === "slot") benchSlot(src.slotId);
      if (src.kind === "reserve") {
        // Add to bench tail if there's room
        if (benchIds.length < BENCH_CAP && !benchIds.includes(src.playerId)) {
          setUserLineup({ ...lineup, bench: [...benchIds, src.playerId] });
          const p = playersById[src.playerId];
          if (p) toast(`${p.lastName} → bench`, "info");
        }
      }
    } catch {
      // ignore malformed drag
    }
  };

  // ---- RENDER --------------------------------------------------------
  return (
    <div className="space-y-3">
      {/* Main 2-column area: LEFT = formations + tactics + pitch +
          actions/profile.  RIGHT = single unified squad list (Starting
          XI / Subs / Reserves). */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3 items-start">
        {/* LEFT column — formations + tactics + pitch + tools */}
        <div className="space-y-3">
        {/* TACTICS STRIP — single compact row of two big buttons that
            pop open modals. The previous stacked board was eating ~360px
            of vertical real estate above the pitch which forced the user
            to scroll on smaller screens; the pitch is the headline of
            this page so we keep the strip short and shove all the
            decision UI into popups. */}
        <div className="panel overflow-hidden">
          <div className="panel-bar flex items-center justify-between gap-2">
            <span>{userClub.name.toUpperCase()} · TACTICS</span>
            <span className="scoreboard text-[color:var(--ss-accent)]">
              {lineup.formationKey} · {lineup.tactic.toUpperCase()}
            </span>
          </div>
          <div className="bg-[color:var(--ss-bg-deep)] grid grid-cols-1 sm:grid-cols-2 gap-px">
            <PickerButton
              label="Formation"
              value={lineup.formationKey}
              hint={`${FORMATION_KEYS.length} shapes`}
              glyph={<FormationGlyph fk={lineup.formationKey} />}
              onClick={() => setPicker("formation")}
            />
            <PickerButton
              label="Style of Play"
              value={lineup.tactic}
              hint={(() => {
                const meta = TACTIC_CATALOGUE.find((t) => t.id === lineup.tactic);
                return meta?.blurb ?? `${TACTIC_CATALOGUE.length} styles`;
              })()}
              glyph={
                <span className="text-[color:var(--ss-accent)] text-2xl leading-none">
                  {TACTIC_CATALOGUE.find((t) => t.id === lineup.tactic)?.glyph ?? "•"}
                </span>
              }
              onClick={() => setPicker("tactic")}
            />
          </div>
        </div>

        {/* PITCH (compact, 4:3 aspect) */}
        <div className="panel overflow-hidden">
          <div className="panel-bar text-base flex items-center justify-between">
            <span>Pitch · {lineup.formationKey} · {lineup.tactic}</span>
            <span className="scoreboard text-[color:var(--ss-accent)]">OVR {teamOvr || "--"}</span>
          </div>

          {/* Big, impossible-to-miss selection banner.
              Shows different content for "no selection", "slot selected
              with player", and "empty slot selected". */}
          {selectedSlotMeta ? (
            <div
              className="px-3 py-2 flex items-center justify-between gap-2 anim-pulse"
              style={{
                background: "var(--ss-accent)",
                color: "#0E0830",
                boxShadow: "inset 0 -3px 0 0 rgba(0,0,0,0.3)",
              }}
            >
              <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] leading-tight">
                {selectedSlotPlayer ? (
                  <>
                    Selected: <span className="scoreboard">{selectedSlotMeta.position}</span>{" "}
                    {selectedSlotPlayer.lastName.toUpperCase()}
                    <span className="block text-[10px] font-bold opacity-80 tracking-[0.04em]">
                      Tap a player on the bench/reserves OR another slot to swap
                    </span>
                  </>
                ) : (
                  <>
                    Empty slot · <span className="scoreboard">{selectedSlotMeta.position}</span>
                    <span className="block text-[10px] font-bold opacity-80 tracking-[0.04em]">
                      Tap any player on the bench/reserves to fill this slot
                    </span>
                  </>
                )}
              </div>
              <button
                onClick={() => setSelectedSlot(null)}
                className="bg-black/85 text-white text-[10px] font-extrabold uppercase tracking-[0.16em] px-2 py-1 hover:bg-black"
                title="Cancel selection (ESC)"
              >
                ✕ Cancel
              </button>
            </div>
          ) : (
            <div className="bg-[color:var(--ss-bg-strip)] text-[color:var(--ss-cream)] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-center border-b border-[color:var(--ss-bg-deep)]">
              ▸ Tap any player or slot to begin a sub · drag tokens to swap
            </div>
          )}

          <Pitch
            formation={formation}
            starters={startersById}
            players={playersById}
            primaryColor={userClub.badge.primaryColor}
            selectedSlotId={selectedSlot}
            roles={lineup.roles}
            slotPositions={lineup.slotPositions}
            onSelectSlot={handleSelectSlot}
            onDropOnSlot={handleDropOnSlot}
            onDropOffPitch={handleDropOffPitch}
            onMoveSlot={(slotId, x, y) => {
              setSlotPosition(slotId, x, y);
              const player = playersById[startersById[slotId] ?? ""] ?? null;
              const overrides = lineup.slotPositions ?? {};
              const previous = overrides[slotId];
              // Preview the new label so the toast is informative even
              // before the next render lands.
              const newPos =
                previous?.position ?? formation.slots.find((s) => s.id === slotId)?.position;
              if (player) {
                toast(
                  newPos
                    ? `${player.lastName} repositioned (${newPos})`
                    : `${player.lastName} repositioned`,
                  "info",
                );
              }
              playSfx("swap");
            }}
            onSetRole={(slotId: string, role: PlayerRole) => {
              setSlotRole(slotId, role);
              const player =
                playersById[startersById[slotId] ?? ""] ?? null;
              const verb = role === "Default" ? "role cleared" : `→ ${role}`;
              if (player) toast(`${player.lastName} ${verb}`, "info");
              playSfx("swap");
            }}
          />
        </div>

        {/* Squad actions — Auto-Pick / Reset positions / Clear selection */}
        <div className="panel overflow-hidden">
          <div className="panel-bar text-sm">Squad Actions</div>
          <div className="grid grid-cols-3 gap-0">
            <button
              onClick={handleAutoPick}
              className="btn btn-stat !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-11 text-xs"
            >
              ▶ Auto-Pick
            </button>
            <button
              onClick={() => {
                // Snap every overridden slot back to its formation
                // default. Only iterate the keys we've actually
                // overridden so this is a no-op for fresh lineups.
                const overrides = lineup.slotPositions ?? {};
                const ids = Object.keys(overrides);
                if (ids.length === 0) return;
                ids.forEach((id) => setSlotPosition(id, null, null));
                toast(`Reset ${ids.length} position${ids.length === 1 ? "" : "s"}`, "info");
              }}
              disabled={!lineup.slotPositions || Object.keys(lineup.slotPositions).length === 0}
              className="btn btn-info !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-11 text-xs disabled:opacity-40"
              title="Snap dragged players back to the formation default"
            >
              ↺ Reset Positions
            </button>
            <button
              onClick={() => setSelectedSlot(null)}
              className="btn btn-action !rounded-none border-0 h-11 text-xs"
              disabled={!selectedSlot}
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* Full profile — only shown when the user explicitly drilled in
         * via the popover's "View Full Profile" button. The popover
         * itself covers the common quick-glance case. */}
        {activePlayer && showFullProfile && (() => {
          const isStarter = Object.values(startersById).includes(activePlayer.id);
          const isOnBench = benchIds.includes(activePlayer.id);
          return (
            <PlayerProfile
              player={activePlayer}
              clubs={allClubs}
              season={career?.season ?? 1}
              isCaptain={lineup.captainId === activePlayer.id}
              primaryColor={userClub.badge.primaryColor}
              secondaryColor={userClub.badge.secondaryColor}
              ownPlayer
              onClose={() => {
                setActivePlayerId(null);
                setShowFullProfile(false);
              }}
              onBench={isStarter ? () => moveToBench(activePlayer.id) : undefined}
              onDrop={(isStarter || isOnBench) ? () => removeFromSquad(activePlayer.id) : undefined}
              onMakeCaptain={() => {
                setUserLineup({ ...lineup, captainId: activePlayer.id });
                toast(`${activePlayer.lastName} captain`, "success");
              }}
            />
          );
        })()}

        {warnings.length > 0 && (
          <div className="panel overflow-hidden">
            <div className="bg-[color:var(--ss-btn-exit)] text-white px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-extrabold">
              ⚠ {warnings.length} Warning{warnings.length !== 1 ? "s" : ""}
            </div>
            <ul className="bg-[color:var(--ss-bg-2)] divide-y divide-[color:var(--ss-bg-deep)] max-h-32 overflow-auto scrollbar-thin">
              {warnings.slice(0, 8).map((w, i) => (
                <li key={i} className="px-3 py-1 text-[11px] uppercase tracking-[0.04em] text-white">
                  <span className="text-[color:var(--ss-btn-exit)] mr-2">▸</span>{w}
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
        {/* /LEFT column */}

        {/* RIGHT column — UNIFIED SQUAD LIST.
            One panel, three sections: Starting XI · Subs · Reserves.
            Drop targets and click-to-swap all stay wired. */}
        <div
          className={`panel overflow-hidden transition-shadow ${
            benchHover || selectedSlot
              ? "ring-2 ring-[color:var(--ss-accent)] ring-offset-0"
              : ""
          }`}
          onDragOver={onBenchListDragOver}
          onDragLeave={() => setBenchHover(false)}
          onDrop={onBenchListDrop}
        >
          <div className="panel-bar text-base flex items-center justify-between">
            <span>Squad · {players.length} Players</span>
            <span className="scoreboard text-[color:var(--ss-accent)]">{teamOvr || "--"}</span>
          </div>

          {selectedSlot && (
            <div
              className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-center text-black anim-pulse"
              style={{ background: "var(--ss-accent)" }}
            >
              ▸ Tap any player below to put them in {selectedSlotMeta?.position ?? "the slot"}
            </div>
          )}

          {/* ===== STARTING XI ===== */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-extrabold text-center border-y-2 border-[color:var(--ss-bar-edge)] flex items-center justify-between">
            <span className="opacity-70">Starting XI</span>
            <span>{filledStarters}/{formation.slots.length}</span>
          </div>
          <div>
            {startersList.map(({ slot, effectivePosition, player }, i) => (
              <StarterRow
                key={slot.id}
                slotPosition={effectivePosition}
                slotIndex={i}
                player={player}
                selected={selectedSlot === slot.id}
                isCaptain={!!player && lineup.captainId === player.id}
                onClick={(anchor) =>
                  handleSelectSlot(
                    selectedSlot === slot.id ? null : slot.id,
                    anchor,
                  )
                }
                onMoveToBench={player ? () => benchSlot(slot.id) : undefined}
                slotId={slot.id}
              />
            ))}
          </div>

          {/* ===== SUBS ===== */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-extrabold text-center border-y-2 border-[color:var(--ss-bar-edge)] flex items-center justify-between">
            <span className="opacity-70">Subs</span>
            <span>{benchIds.length}/{BENCH_CAP}</span>
          </div>
          {benchIds.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-3 text-center text-[color:var(--muted)] text-[10px] uppercase tracking-[0.18em]">
              Empty bench · drag a player here or hit ▶ on a reserve
            </div>
          ) : (
            <div>
              {benchIds.map((id, i) => {
                const p = playersById[id];
                if (!p) return null;
                return (
                  <PlayerRow
                    key={id}
                    p={p}
                    rowKind="bench"
                    index={i}
                    alt={i % 2 === 1}
                    active={activePlayerId === p.id}
                    slotSelected={!!selectedSlot}
                    onClick={(anchor) => handlePlayerPick(p.id, anchor)}
                    onSubIn={() => handleQuickSubIn(p.id)}
                    onMoveUp={i > 0 ? () => reorderBench(id, i - 1) : undefined}
                    onMoveDown={i < benchIds.length - 1 ? () => reorderBench(id, i + 1) : undefined}
                  />
                );
              })}
            </div>
          )}

          {/* ===== RESERVES ===== */}
          <div className="bg-[color:var(--ss-bar-2)] text-[color:var(--ss-bar-text)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-extrabold text-center border-y-2 border-[color:var(--ss-bar-edge)] flex items-center justify-between">
            <span className="opacity-70">Reserves</span>
            <span>{reserves.length}</span>
          </div>
          <div className="bg-[color:var(--ss-bg-deep)] flex">
            {(["overall", "form", "fitness", "value", "age"] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={`flex-1 px-1 py-1 text-[9px] uppercase tracking-[0.14em] font-extrabold border-r border-[color:var(--ss-bg-deep)] last:border-r-0 transition-colors ${
                  sortKey === k
                    ? "bg-[color:var(--ss-accent)] text-black"
                    : "bg-[color:var(--ss-bg-strip)] text-[color:var(--muted)] hover:bg-[color:var(--ss-bg-2)]"
                }`}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          {reserves.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-4 text-center text-[color:var(--muted)] text-[10px] uppercase tracking-[0.18em]">
              No reserves
            </div>
          ) : (
            <div className="max-h-[420px] overflow-auto scrollbar-thin">
              {reserves.map((p, i) => (
                <PlayerRow
                  key={p.id}
                  p={p}
                  rowKind="reserves"
                  index={i}
                  alt={i % 2 === 1}
                  active={activePlayerId === p.id}
                  slotSelected={!!selectedSlot}
                  onClick={(anchor) => handlePlayerPick(p.id, anchor)}
                  onSubIn={() => handleQuickSubIn(p.id)}
                />
              ))}
            </div>
          )}

          <div className="ss-strip text-[10px] tracking-[0.16em] px-3 py-1.5 text-center">
            Tap a starter to select · tap a sub/reserve to swap · ▶ for one-click sub
          </div>
        </div>
        {/* /RIGHT column */}
      </div>

      {/* Floating quick-stats popover (anchored to whichever player was
       * last clicked). Closing it keeps the slot selection so the user
       * can still tap-to-swap. */}
      {popover && playersById[popover.playerId] && !showFullProfile && (() => {
        const pid = popover.playerId;
        const isStarter = Object.values(startersById).includes(pid);
        const isOnBench = benchIds.includes(pid);
        return (
          <PlayerStatPopover
            player={playersById[pid]}
            anchor={popover.anchor}
            slotPosition={popover.slotPosition}
            isCaptain={lineup.captainId === pid}
            onClose={() => setPopover(null)}
            onViewFullProfile={() => {
              setActivePlayerId(pid);
              setShowFullProfile(true);
              setPopover(null);
            }}
            // Only offer "To Bench" if the player is currently a starter — for
            // a sub or reserve it's either a no-op or unintuitive.
            onBench={isStarter ? () => {
              moveToBench(pid);
              setPopover(null);
            } : undefined}
            onMakeCaptain={() => {
              setUserLineup({ ...lineup, captainId: pid });
              const p = playersById[pid];
              if (p) toast(`${p.lastName} captain`, "success");
            }}
            // Only offer "To Reserves" if the player is in the matchday squad
            // (starter or bench). Reserves players are already there.
            onDrop={(isStarter || isOnBench) ? () => {
              removeFromSquad(pid);
              setPopover(null);
            } : undefined}
          />
        );
      })()}

      {/* FORMATION PICKER MODAL — opens from the strip's "Formation"
          chip. Same FormationCard grid we used to render inline, just
          relocated into a popup so the pitch keeps the headline. */}
      {picker === "formation" && (
        <PickerModal
          title={`Formation · current ${lineup.formationKey}`}
          subtitle={`${FORMATION_KEYS.length} shapes · tap to switch`}
          onClose={() => setPicker(null)}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px">
            {FORMATION_KEYS.map((k) => (
              <FormationCard
                key={k}
                fk={k}
                active={lineup.formationKey === k}
                onClick={() => {
                  if (lineup.formationKey === k) {
                    setPicker(null);
                    return;
                  }
                  setUserFormation(k);
                  setSelectedSlot(null);
                  toast(`Formation → ${k}`, "info");
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </PickerModal>
      )}

      {/* TACTIC PICKER MODAL — same TacticCard grid as before, just
          tucked behind the "Style of Play" chip. Sorted defensive →
          aggressive (matches TACTIC_CATALOGUE order). */}
      {picker === "tactic" && (
        <PickerModal
          title={`Style of Play · current ${lineup.tactic}`}
          subtitle={`${TACTIC_CATALOGUE.length} styles · sorted defensive → aggressive`}
          onClose={() => setPicker(null)}
        >
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            {TACTIC_CATALOGUE.map((t) => (
              <TacticCard
                key={t.id}
                meta={t}
                active={lineup.tactic === t.id}
                onClick={() => {
                  if (lineup.tactic === t.id) {
                    setPicker(null);
                    return;
                  }
                  setUserTactic(t.id);
                  toast(`Tactic → ${t.id}`, "info");
                  setPicker(null);
                }}
              />
            ))}
          </div>
        </PickerModal>
      )}
    </div>
  );
}

// =====================================================================
// Building blocks
// =====================================================================

/** A single Starting-XI row in the unified squad list.
 * Renders the slot's position chip, slot index, and the player who
 * occupies it (or "Empty"). Click selects the slot. Drag-from-the-row
 * is treated like drag-from-the-pitch-token (slot drag source). */
function StarterRow({
  slotId,
  slotPosition,
  slotIndex,
  player,
  selected,
  isCaptain,
  onClick,
  onMoveToBench,
}: {
  slotId: string;
  slotPosition: string;
  slotIndex: number;
  player: Player | null;
  selected: boolean;
  isCaptain: boolean;
  onClick: (anchor?: DOMRect | null) => void;
  onMoveToBench?: () => void;
}) {
  const slotBroad = ((): "GK" | "DEF" | "MID" | "FWD" => {
    if (slotPosition === "GK") return "GK";
    if (["CB", "LB", "RB"].includes(slotPosition)) return "DEF";
    if (["DM", "CM", "AM", "LM", "RM"].includes(slotPosition)) return "MID";
    return "FWD";
  })();
  const outOfPos = !!player && player.position !== slotBroad;

  // Background: alternating purple, brighter when selected.
  const bg = selected
    ? "var(--ss-accent)"
    : slotIndex % 2 === 0
      ? "var(--ss-row)"
      : "var(--ss-row-2)";
  const fg = selected ? "#0E0830" : "#FFFFFF";

  return (
    <div
      draggable={!!player}
      onDragStart={
        player
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(
                PITCH_DT_TYPE,
                encodeDragPayload({ kind: "slot", slotId }),
              );
            }
          : undefined
      }
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onClick(rect);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onClick(rect);
        }
      }}
      className="grid grid-cols-[36px_28px_1fr_40px_40px_40px] items-stretch font-bold uppercase tracking-[0.04em] text-[12px] cursor-pointer transition-all hover:brightness-110"
      style={{
        background: bg,
        color: fg,
        boxShadow: selected
          ? undefined
          : "inset 4px 0 0 0 rgba(255,208,0,0.55)",
      }}
      title={
        player
          ? `Tap to select · then tap any sub/reserve to swap`
          : `Empty slot · tap to select then tap any player to fill`
      }
    >
      <span
        className="grid place-items-center scoreboard text-[11px] font-extrabold"
        style={{
          background: positionColor(slotPosition),
          color: "#0A0A0A",
          fontFamily: "var(--font-display)",
        }}
      >
        {slotPosition}
      </span>
      <span
        className="grid place-items-center scoreboard text-[12px]"
        style={{ color: selected ? "#0E0830" : "rgba(255,255,255,0.85)" }}
      >
        {slotIndex + 1}
      </span>
      <span className="px-2 py-1 flex flex-col justify-center min-w-0">
        {player ? (
          <>
            <span className="truncate flex items-center gap-1.5">
              <span>{player.lastName.toUpperCase()}</span>
              {outOfPos && (
                <span className="bg-black text-[color:var(--ss-accent)] text-[9px] px-1">OOP</span>
              )}
              {player.isInjured && (
                <span className="bg-black text-white text-[9px] px-1">INJ</span>
              )}
              {isCaptain && (
                <span className="bg-[color:var(--ss-accent)] text-black text-[9px] px-1 border border-black/40">C</span>
              )}
            </span>
            <span className="text-[9px] tracking-[0.14em] opacity-80 truncate">
              {player.detailedPosition} · AGE {player.age} · FORM {player.form} · FIT {player.fitness}
            </span>
          </>
        ) : (
          <span className="opacity-60 italic">— Empty —</span>
        )}
      </span>
      <span
        className="ss-stat flex items-center justify-center scoreboard text-[13px]"
        style={{ color: selected ? "#0E0830" : "#FFFFFF" }}
      >
        {player ? player.overall : "—"}
      </span>
      <span
        className="ss-stat-alt flex items-center justify-center text-[10px]"
        style={{ color: selected ? "#0E0830" : "rgba(255,255,255,0.85)" }}
      >
        {player ? formatValue(player.value) : "—"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onMoveToBench?.();
        }}
        disabled={!onMoveToBench}
        title="Move to bench"
        aria-label="Move to bench"
        className="grid place-items-center font-extrabold text-[11px] uppercase tracking-[0.06em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: "var(--ss-btn-info)",
          color: "#FFFFFF",
          fontFamily: "var(--font-display)",
        }}
      >
        ▼
      </button>
    </div>
  );
}

function PlayerRow({
  p, alt, active, rowKind, index, slotSelected, onClick, onSubIn, onMoveUp, onMoveDown,
}: {
  p: Player;
  alt?: boolean;
  active?: boolean;
  rowKind?: "bench" | "reserves";
  index: number;
  slotSelected?: boolean;
  onClick: (anchor?: DOMRect | null) => void;
  onSubIn?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const baseA = rowKind === "bench" ? "var(--ss-row-bench)" : "var(--ss-row)";
  const baseB = rowKind === "bench" ? "var(--ss-row-bench2)" : "var(--ss-row-2)";
  const bg = active
    ? "var(--ss-accent)"
    : p.isInjured
      ? "var(--ss-row-danger)"
      : alt ? baseB : baseA;
  const fg = active ? "#0E0830" : "#FFFFFF";

  const dragSrc: DragSource =
    rowKind === "bench"
      ? { kind: "bench", playerId: p.id }
      : { kind: "reserve", playerId: p.id };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(PITCH_DT_TYPE, encodeDragPayload(dragSrc));
      }}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onClick(rect);
      }}
      className="cursor-grab active:cursor-grabbing grid grid-cols-[36px_28px_1fr_40px_40px_40px] items-stretch font-bold uppercase tracking-[0.04em] text-[12px] transition-all hover:brightness-110"
      style={{
        background: bg,
        color: fg,
        boxShadow: slotSelected && !active ? "inset 0 0 0 1px rgba(255,208,0,0.6)" : undefined,
      }}
      title={slotSelected ? "Tap to swap into selected slot" : "Click to view profile · drag to a slot"}
    >
      <span
        className="grid place-items-center scoreboard text-[11px] font-extrabold"
        style={{ background: positionColor(p.detailedPosition), color: "#0A0A0A" }}
      >
        {p.detailedPosition}
      </span>
      {rowKind === "bench" ? (
        <div className="flex flex-col bg-black/20">
          <button
            type="button"
            disabled={!onMoveUp}
            onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }}
            className="flex-1 text-[9px] leading-none disabled:opacity-30 hover:bg-black/30"
            title="Move up sub order"
            aria-label="Move up sub order"
          >▲</button>
          <button
            type="button"
            disabled={!onMoveDown}
            onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }}
            className="flex-1 text-[9px] leading-none disabled:opacity-30 hover:bg-black/30"
            title="Move down sub order"
            aria-label="Move down sub order"
          >▼</button>
        </div>
      ) : (
        <span className="grid place-items-center scoreboard text-[11px] text-white/85">
          {index + 1}
        </span>
      )}
      <span className="px-2 py-1 flex flex-col justify-center min-w-0">
        <span className="truncate flex items-center gap-2">
          <span>{p.lastName.toUpperCase()}</span>
          {p.isInjured && <span className="bg-black text-white text-[9px] px-1">INJ</span>}
        </span>
        <span className="text-[9px] tracking-[0.14em] opacity-80 truncate">
          AGE {p.age} · FORM {p.form} · FIT {p.fitness}
        </span>
      </span>
      <span className="ss-stat flex items-center justify-center scoreboard text-[13px]" style={{ color: "#FFFFFF" }}>
        {p.overall}
      </span>
      <span className="ss-stat-alt flex items-center justify-center text-[10px]" style={{ color: "rgba(255,255,255,0.85)" }}>
        {formatValue(p.value).replace("M", "m").replace("K", "k").replace("£", "£")}
      </span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSubIn?.(); }}
        disabled={p.isInjured || !onSubIn}
        title={
          slotSelected
            ? `Put ${p.lastName} in selected slot`
            : `Sub ${p.lastName} into the XI`
        }
        aria-label={`Sub ${p.lastName} in`}
        className="grid place-items-center font-extrabold text-[11px] uppercase tracking-[0.06em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: slotSelected ? "var(--ss-accent)" : "var(--ss-btn-stat)",
          color: slotSelected ? "#0E0830" : "#FFFFFF",
          fontFamily: "var(--font-display)",
          letterSpacing: "0.06em",
        }}
      >
        ▶
      </button>
    </div>
  );
}

function sortBy(a: Player, b: Player, key: SortKey): number {
  switch (key) {
    case "overall": return b.overall - a.overall;
    case "form": return b.form - a.form;
    case "fitness": return b.fitness - a.fitness;
    case "value": return b.value - a.value;
    case "age": return a.age - b.age;
  }
}

function positionColor(pos: string): string {
  if (pos === "GK") return "#FFD000";
  if (["CB","LB","RB"].includes(pos)) return "#5FB3E8";
  if (["DM","CM","AM","LM","RM"].includes(pos)) return "#9AF09A";
  return "#FF8585";
}

