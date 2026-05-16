"use client";

// =====================================================================
// <Pitch /> — drag-and-drop tactical board.
//
// Each player token shows three things at once:
//   1. SLOT chip (top centre) — the tactical role on the pitch (e.g. AM)
//   2. NAT chip (top-left)    — the player's natural position (e.g. ST)
//      Only shown when it differs from the slot, so out-of-position
//      assignments are always obvious at a glance.
//   3. ROLE chip (bottom-right) — the per-player tactical instruction
//      ("PM" Playmaker, "GF" Get Forward, ...). Hidden when "Default".
//
// The little ▾ arrow next to the token opens the role menu. Click on
// the token itself selects/opens the player; drag-and-drop swaps with
// any other slot or sends the player to the bench list.
// =====================================================================

import { useEffect, useRef, useState } from "react";
import type {
  DetailedPosition,
  Formation,
  Player,
  PlayerRole,
} from "@/types/game";
import { detailedToBroad } from "@/data/formations";
import {
  ROLE_ABBR,
  ROLE_GLYPH,
  ROLE_LABEL,
  rolesForPosition,
} from "@/data/playerRoles";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";

export type DragSource =
  | { kind: "slot"; slotId: string }
  | { kind: "bench"; playerId: string }
  | { kind: "reserve"; playerId: string };

export interface PitchProps {
  formation: Formation;
  starters: Record<string, string>;     // slotId -> playerId
  players: Record<string, Player>;
  primaryColor: string;
  selectedSlotId: string | null;
  /** slotId -> chosen tactical role (defaults to "Default" when missing). */
  roles?: Record<string, PlayerRole>;
  /** slotId -> manual position override (drag-to-reposition).
   * Missing keys fall back to the formation's default slot coords. */
  slotPositions?: Record<
    string,
    { x: number; y: number; position: DetailedPosition }
  >;
  /** Receives the slot id plus the bounding rect of the clicked token,
   * so callers can anchor a popover to the actual on-pitch position. */
  onSelectSlot: (slotId: string | null, anchor?: DOMRect | null) => void;
  onDropOnSlot: (target: string, source: DragSource) => void;
  onDropOffPitch: (source: DragSource) => void;
  onSetRole?: (slotId: string, role: PlayerRole) => void;
  /** Fired when the user drags a slot to an empty pitch zone. (x, y)
   * are in 0..1 normalised pitch space and match `FormationSlot`. */
  onMoveSlot?: (slotId: string, x: number, y: number) => void;
}

const DT_TYPE = "application/x-gaffer-drag";

export function Pitch({
  formation,
  starters,
  players,
  primaryColor,
  selectedSlotId,
  roles,
  slotPositions,
  onSelectSlot,
  onDropOnSlot,
  onDropOffPitch,
  onSetRole,
  onMoveSlot,
}: PitchProps) {
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [draggingFromSlot, setDraggingFromSlot] = useState<string | null>(null);
  const [openRoleSlot, setOpenRoleSlot] = useState<string | null>(null);
  // Ref to the pitch surface so we can compute drop coordinates in
  // 0..1 space when the user drops a slot on empty grass.
  const pitchRef = useRef<HTMLDivElement | null>(null);
  // Live x/y while a slot is being dragged — used to render a ghost
  // marker that shows where the slot will land. Null when no drag is
  // active. Coordinates are in 0..1 pitch space.
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const decode = (e: React.DragEvent): DragSource | null => {
    try {
      const raw = e.dataTransfer.getData(DT_TYPE);
      if (!raw) return null;
      return JSON.parse(raw) as DragSource;
    } catch {
      return null;
    }
  };

  const handleSlotClick = (slotId: string, anchor?: DOMRect | null) => {
    if (selectedSlotId === slotId) {
      onSelectSlot(null);
    } else if (selectedSlotId) {
      // Click-mode swap: click selected slot, then click destination slot
      onDropOnSlot(slotId, { kind: "slot", slotId: selectedSlotId });
      onSelectSlot(null);
    } else {
      onSelectSlot(slotId, anchor ?? null);
    }
  };

  // Close the role menu on outside click / ESC
  useEffect(() => {
    if (!openRoleSlot) return;
    const onDown = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.closest("[data-role-menu]")) return;
      if (tgt.closest("[data-role-trigger]")) return;
      setOpenRoleSlot(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRoleSlot(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openRoleSlot]);

  // Convert a drag/drop browser event into normalised 0..1 pitch
  // coordinates. The pitch's CSS uses `top: (1 - y)` so y is inverted
  // from raw clientY. Returns null if the pitch hasn't mounted yet.
  const coordsFromEvent = (e: React.DragEvent): { x: number; y: number } | null => {
    const el = pitchRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = 1 - (e.clientY - rect.top) / rect.height;
    return { x: rawX, y: rawY };
  };

  return (
    <div className="flex flex-col">
    <div
      ref={pitchRef}
      className="relative w-full select-none bg-[color:var(--pitch-2)] aspect-[4/3]"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DT_TYPE)) return;
        e.preventDefault();
        // Show a live ghost where the slot will land — but only when
        // the drag originated from the pitch (slot drag). For bench /
        // reserve drags onto empty grass we don't draw a ghost
        // because those drops aren't repositioning operations.
        if (onMoveSlot && draggingFromSlot) {
          const c = coordsFromEvent(e);
          if (c) setGhost(c);
        }
      }}
      onDragLeave={(e) => {
        // Clear ghost only when actually leaving the pitch (not when
        // crossing into a child element which fires dragleave too).
        const rt = e.relatedTarget as Node | null;
        if (!rt || !pitchRef.current?.contains(rt)) setGhost(null);
      }}
      onDrop={(e) => {
        // Drop on the pitch background (not a slot). We support two
        // distinct intents here:
        //   1) A *slot* drag dropped on empty grass → REPOSITION the
        //      slot to that x/y (the new "fluid drag" gesture).
        //   2) A bench/reserve drag dropped on grass → no-op, the
        //      target should be a slot or the squad list.
        const src = decode(e);
        setHoverSlot(null);
        setGhost(null);
        if (!src) return;
        if (src.kind !== "slot") return;
        if (onMoveSlot) {
          const c = coordsFromEvent(e);
          if (c) {
            e.preventDefault();
            e.stopPropagation();
            onMoveSlot(src.slotId, c.x, c.y);
            return;
          }
        }
        // Fallback: caller didn't wire the reposition handler, so fall
        // back to the legacy "drag-to-grass = bench" behaviour.
        onDropOffPitch(src);
      }}
    >
      <PitchMarkings />

      {/* Ghost marker — appears under the cursor while a slot is
       * being dragged so the user gets a visible target. */}
      {ghost && draggingFromSlot && onMoveSlot && (
        <div
          aria-hidden
          className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
          style={{
            left: `${ghost.x * 100}%`,
            top: `${(1 - ghost.y) * 100}%`,
          }}
        >
          <span
            className="block size-12 sm:size-14 border-2 border-dashed"
            style={{
              borderColor: "var(--ss-accent)",
              background: "rgba(255,208,0,0.18)",
            }}
          />
        </div>
      )}

      {formation.slots.map((slot) => {
        const occupantId = starters[slot.id];
        const player = occupantId ? players[occupantId] : null;
        const isSelected = selectedSlotId === slot.id;
        const isHover = hoverSlot === slot.id;
        const isDragging = draggingFromSlot === slot.id;

        // Apply the drag-to-reposition override on top of the
        // formation default. This is the single source of truth used
        // for placement, position label, and out-of-position check.
        const override = slotPositions?.[slot.id];
        const slotX = override?.x ?? slot.x;
        const slotY = override?.y ?? slot.y;
        const slotPosition = override?.position ?? slot.position;

        const left = `${slotX * 100}%`;
        const top = `${(1 - slotY) * 100}%`;

        const slotBroad = detailedToBroad(slotPosition);
        const outOfPos = player && player.position !== slotBroad;
        const role = roles?.[slot.id] ?? "Default";
        const showRoleChip = role !== "Default";
        const isRoleMenuOpen = openRoleSlot === slot.id;
        const isOverridden = !!override;

        return (
          <div
            key={slot.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
            style={{
              left,
              top,
              opacity: isDragging ? 0.35 : 1,
              // Smooth glide when the slot snaps to its new home after
              // a drop — but only when the drag has ended, otherwise
              // the live ghost preview is enough.
              transition: isDragging
                ? undefined
                : "left 220ms ease, top 220ms ease",
            }}
          >
            {/* Drop zone wrapper: catches drags onto this slot. Padding is
                generous so the hitbox is comfortably bigger than the
                visible token, making drag-and-drop forgiving. */}
            <div
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DT_TYPE)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setHoverSlot(slot.id);
                }
              }}
              onDragLeave={() => setHoverSlot((s) => (s === slot.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const src = decode(e);
                setHoverSlot(null);
                if (!src) return;
                onDropOnSlot(slot.id, src);
              }}
              className={`relative grid place-items-center rounded-none ${
                isHover ? "ring-2 ring-[color:var(--ss-accent)] ring-offset-0" : ""
              }`}
              style={{
                padding: 12,
                background: isHover ? "rgba(255,208,0,0.18)" : "transparent",
              }}
            >
              {player ? (
                <div className="relative grid place-items-center" style={{ touchAction: "none" }}>
                  <button
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(
                        DT_TYPE,
                        JSON.stringify({ kind: "slot", slotId: slot.id }),
                      );
                      setDraggingFromSlot(slot.id);
                    }}
                    onDragEnd={() => {
                      setDraggingFromSlot(null);
                      setHoverSlot(null);
                      setGhost(null);
                    }}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      handleSlotClick(slot.id, rect);
                    }}
                    className="relative grid place-items-center cursor-grab active:cursor-grabbing"
                  >
                    {/* Selection halo */}
                    {isSelected && (
                      <span
                        className="absolute -inset-2 pointer-events-none anim-pulse"
                        style={{
                          boxShadow:
                            "0 0 0 3px var(--ss-accent), 0 0 0 6px rgba(255,208,0,0.35)",
                        }}
                      />
                    )}
                    {/* Out-of-position warning ring */}
                    {outOfPos && !isSelected && (
                      <span
                        className="absolute -inset-1 pointer-events-none"
                        style={{ boxShadow: "0 0 0 2px #FFD000" }}
                      />
                    )}
                    {/* Injury ring */}
                    {player.isInjured && (
                      <span
                        className="absolute -inset-1.5 pointer-events-none"
                        style={{ boxShadow: "0 0 0 3px var(--ss-btn-exit)" }}
                      />
                    )}
                    {/* Hand-drawn portrait avatar inside a club-coloured
                     * frame. Replaces the old 3-letter monogram so each
                     * player on the pitch reads as a recognisable face
                     * rather than an abbreviation. The frame keeps the
                     * club colour so kits stay legible at a glance. */}
                    <span
                      className="block shadow-lg transition-transform hover:scale-110"
                      style={{
                        // Outer chrome — club colour border + drop shadow.
                        // Inner content is the avatar PNG.
                        background: primaryColor,
                        border: "2px solid rgba(255,255,255,0.95)",
                        padding: 2,
                        lineHeight: 0,
                      }}
                    >
                      <PlayerAvatar
                        playerId={player.id}
                        width={44}
                        border="rgba(0,0,0,0)"
                        tint={primaryColor}
                      />
                    </span>
                    {/* SLOT position chip — what role we want them to play.
                     * Reflects the user's drag-to-reposition override
                     * if they've moved this slot. Bumped to text-[10px]
                     * so it's actually readable on a regular display. */}
                    <span
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-1.5 py-px text-[10px] font-extrabold uppercase tracking-[0.14em] pointer-events-none whitespace-nowrap border border-black/40"
                      style={{
                        background: positionColor(slotPosition),
                        color: "#0A0A0A",
                        lineHeight: "1.2",
                        fontFamily: "var(--font-display)",
                      }}
                      title={
                        isOverridden
                          ? `Custom position · plays as ${slotPosition}`
                          : `Slot · plays as ${slotPosition}`
                      }
                    >
                      {slotPosition}
                      {isOverridden && (
                        <span
                          className="ml-0.5"
                          style={{ color: "#7E1A2D" }}
                          title="Position manually adjusted"
                        >
                          ◆
                        </span>
                      )}
                    </span>
                    {/* NATURAL position chip — bottom-left, only when OOP */}
                    {outOfPos && (
                      <span
                        className="absolute -bottom-1.5 -left-1 px-1 py-px text-[9px] font-extrabold uppercase tracking-[0.10em] pointer-events-none border border-black/40"
                        style={{
                          background: "#1A0F4D",
                          color: "#FFD000",
                          lineHeight: "1.3",
                          fontFamily: "var(--font-display)",
                        }}
                        title={`Natural · ${player.detailedPosition}`}
                      >
                        NAT {player.detailedPosition}
                      </span>
                    )}
                    {/* ROLE chip — bottom-right, only when not Default */}
                    {showRoleChip && (
                      <span
                        className="absolute -bottom-1.5 -right-1 px-1 py-px text-[10px] font-extrabold uppercase tracking-[0.06em] pointer-events-none border border-black/50"
                        style={{
                          background: "#FFFFFF",
                          color: "#0E0830",
                          lineHeight: "1.3",
                          fontFamily: "var(--font-display)",
                        }}
                        title={ROLE_LABEL[role]}
                      >
                        {ROLE_GLYPH[role]} {ROLE_ABBR[role]}
                      </span>
                    )}
                    {/* Name + OVR below — bumped from 10px → 12px and
                     * given a heavier shadow + a small dark backing pill
                     * so it stays readable over the brighter pitch
                     * stripes. */}
                    <span
                      className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-extrabold uppercase tracking-[0.04em] text-white pointer-events-none px-1.5 py-0.5"
                      style={{
                        background: "rgba(14,8,48,0.78)",
                        textShadow: "0 1px 0 #000, 0 0 4px rgba(0,0,0,0.85)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {player.lastName.toUpperCase()}{" "}
                      <span className="scoreboard text-[color:var(--ss-accent)] text-[13px]">
                        {player.overall}
                      </span>
                    </span>
                  </button>

                  {/* ROLE menu trigger arrow — only when onSetRole is wired */}
                  {onSetRole && (
                    <button
                      type="button"
                      data-role-trigger
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRoleSlot(isRoleMenuOpen ? null : slot.id);
                      }}
                      title="Pick a role"
                      aria-label="Pick a role"
                      className="absolute -top-2 -right-3 size-5 grid place-items-center text-[10px] font-extrabold border border-black/60 hover:scale-110 transition-transform"
                      style={{
                        background: showRoleChip ? "#FFD000" : "#FFFFFF",
                        color: "#0E0830",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      ▾
                    </button>
                  )}

                  {/* ROLE menu — opens below the token */}
                  {isRoleMenuOpen && onSetRole && (
                    <div
                      data-role-menu
                      onClick={(e) => e.stopPropagation()}
                      className="absolute z-30 left-1/2 -translate-x-1/2 mt-2 top-full min-w-[180px] border-2 border-[color:var(--ss-bg-deep)] shadow-2xl"
                      style={{ background: "var(--ss-bg-2)" }}
                    >
                      <div
                        className="px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.18em] text-center"
                        style={{
                          background: "var(--ss-bar-2)",
                          color: "var(--ss-bar-text)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {player.lastName.toUpperCase()} · ROLE
                      </div>
                      {rolesForPosition(slotPosition).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            onSetRole(slot.id, r);
                            setOpenRoleSlot(null);
                          }}
                          className={`w-full text-left px-2 py-1.5 text-[10px] uppercase tracking-[0.06em] font-bold transition-colors flex items-center gap-2 ${
                            r === role
                              ? "bg-[color:var(--ss-accent)] text-black"
                              : "text-white hover:bg-[color:var(--ss-row-2)]"
                          }`}
                          title={ROLE_LABEL[r]}
                        >
                          <span className="inline-block w-4 text-center">{ROLE_GLYPH[r]}</span>
                          <span className="flex-1">{r}</span>
                          {r === role && <span className="text-[9px]">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    handleSlotClick(slot.id, rect);
                  }}
                  className={`size-12 sm:size-14 grid place-items-center text-[11px] sm:text-[12px] uppercase tracking-[0.18em] font-extrabold border-2 border-dashed cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[color:var(--ss-accent)] text-black border-[color:var(--ss-accent)] anim-pulse scale-110"
                      : isHover
                        ? "bg-[color:var(--ss-accent)]/30 text-white border-[color:var(--ss-accent)]"
                        : "bg-black/40 text-white border-white/60 hover:bg-black/60 hover:scale-105"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {slotPosition}
                </button>
              )}
            </div>
          </div>
        );
      })}

    </div>
      {/* Hint strip — sits BELOW the pitch so it never covers the GK
          token. Different copy when something is selected. */}
      <div
        className="px-2 py-1.5 text-[10px] uppercase tracking-[0.18em] text-center font-extrabold border-t border-[color:var(--ss-bg-deep)]"
        style={{
          background: selectedSlotId
            ? "var(--ss-accent)"
            : "var(--ss-bg-deep)",
          color: selectedSlotId ? "#0E0830" : "var(--ss-cream)",
        }}
      >
        {selectedSlotId
          ? "▸ Tap another player or slot to swap · ESC to cancel"
          : "Drag onto a slot to swap · drag to empty grass to reposition · drop on squad list to bench"}
      </div>
    </div>
  );
}

/**
 * Helper exposed for the page so list rows can encode their drag payload
 * the same way as on-pitch tokens.
 */
export function encodeDragPayload(src: DragSource): string {
  return JSON.stringify(src);
}
export const PITCH_DT_TYPE = DT_TYPE;

function PitchMarkings() {
  return (
    <svg
      viewBox="0 0 100 75"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
    >
      <defs>
        <pattern id="stripes" patternUnits="userSpaceOnUse" width="100" height="7.5">
          <rect width="100" height="3.75" fill="#1F8B33" />
          <rect y="3.75" width="100" height="3.75" fill="#166D26" />
        </pattern>
      </defs>
      <rect width="100" height="75" fill="url(#stripes)" />
      <g stroke="#FFFFFF" strokeWidth="0.3" fill="none" strokeOpacity="0.95">
        <rect x="2" y="2" width="96" height="71" />
        <line x1="2" y1="37.5" x2="98" y2="37.5" />
        <circle cx="50" cy="37.5" r="7.5" />
        <circle cx="50" cy="37.5" r="0.5" fill="#FFFFFF" />
        {/* Top box */}
        <rect x="28" y="2" width="44" height="9" />
        <rect x="38" y="2" width="24" height="4" />
        <circle cx="50" cy="8" r="0.5" fill="#FFFFFF" />
        <path d="M 42 11 A 7.5 7.5 0 0 0 58 11" />
        {/* Bottom box */}
        <rect x="28" y="64" width="44" height="9" />
        <rect x="38" y="69" width="24" height="4" />
        <circle cx="50" cy="67" r="0.5" fill="#FFFFFF" />
        <path d="M 42 64 A 7.5 7.5 0 0 1 58 64" />
        {/* Corner arcs */}
        <path d="M 2 4 A 2 2 0 0 0 4 2" />
        <path d="M 98 4 A 2 2 0 0 1 96 2" />
        <path d="M 2 71 A 2 2 0 0 1 4 73" />
        <path d="M 98 71 A 2 2 0 0 0 96 73" />
      </g>
    </svg>
  );
}

function positionColor(pos: string): string {
  if (pos === "GK") return "#FFD000";
  if (["CB","LB","RB"].includes(pos)) return "#5FB3E8";
  if (["DM","CM","AM","LM","RM"].includes(pos)) return "#9AF09A";
  return "#FF8585";
}
