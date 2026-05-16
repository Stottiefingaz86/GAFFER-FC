"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import type { Formation, Player } from "@/types/game";
import { detailedToBroad } from "@/data/formations";

export interface TacticsBoardProps {
  formation: Formation;
  starters: Record<string, string>; // slotId -> playerId
  bench: string[];
  players: Player[];
  primaryColor: string;
  onAssign: (slotId: string, playerId: string) => void;
  onSwap: (a: string, b: string) => void;
  onRemove: (slotId: string) => void;
}

interface SlotInstance {
  slotId: string;
  position: string;
  x: number;
  y: number;
  // Visual layers
  positionGlow: PIXI.Graphics;
  warningGlow: PIXI.Graphics;
  fitnessRing: PIXI.Graphics;
  ring: PIXI.Graphics;
  badge: PIXI.Graphics;
  initials: PIXI.Text;
  numberLabel: PIXI.Text;
  nameLabel: PIXI.Text;
  formChip: PIXI.Graphics;
  selectGlow: PIXI.Graphics;
  // Interaction shell — invisible but explicitly hit-tested
  hit: PIXI.Container;
  occupant: string | null;
}

interface DragState {
  fromSlotId: string;
  ghost: PIXI.Container;
  startPointer: { x: number; y: number };
  moved: boolean;
}

const PITCH_PADDING_TOP = 32;
const PITCH_PADDING_BOTTOM = 32;
const PITCH_PADDING_X = 24;
const SLOT_HIT_RADIUS = 34;
const TAP_THRESHOLD = 6;

export function TacticsBoard(props: TacticsBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const host = containerRef.current;

    const app = new PIXI.Application();

    let mounted = true;
    let ro: ResizeObserver | null = null;
    const slotInstances: SlotInstance[] = [];
    const cleanupTasks: Array<() => void> = [];

    let drag: DragState | null = null;
    let selectedSlotId: string | null = null;

    (async () => {
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        resizeTo: host,
      });
      if (!mounted) {
        app.destroy(true, { children: true, texture: true });
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.borderRadius = "12px";
      app.canvas.style.touchAction = "none";
      app.canvas.style.cursor = "default";

      const stage = app.stage;
      stage.eventMode = "static";
      stage.hitArea = app.screen;

      const pitchLayer = new PIXI.Container();
      const slotLayer = new PIXI.Container();
      const dragLayer = new PIXI.Container();
      slotLayer.eventMode = "static";
      dragLayer.eventMode = "passive";
      stage.addChild(pitchLayer, slotLayer, dragLayer);

      const drawPitch = () => {
        pitchLayer.removeChildren();
        const w = app.canvas.width / app.renderer.resolution;
        const h = app.canvas.height / app.renderer.resolution;

        // Bright pitch stripes — vivid, saturated, but not cartoony.
        const grass = new PIXI.Graphics();
        const stripeCount = 10;
        for (let i = 0; i < stripeCount; i++) {
          const stripeColor = i % 2 === 0 ? 0x1f8b33 : 0x166d26;
          grass.rect(0, (h / stripeCount) * i, w, h / stripeCount).fill(stripeColor);
        }

        // Vignette so the pitch glows from the centre.
        const vignette = new PIXI.Graphics();
        vignette.rect(0, 0, w, 18).fill({ color: 0x000000, alpha: 0.35 });
        vignette.rect(0, h - 18, w, 18).fill({ color: 0x000000, alpha: 0.35 });

        // Pitch lines — clean white, full opacity.
        const lineWidth = 2;
        const lines = new PIXI.Graphics();
        lines.setStrokeStyle({ width: lineWidth, color: 0xffffff, alpha: 0.9 });
        lines
          .rect(PITCH_PADDING_X, PITCH_PADDING_TOP, w - PITCH_PADDING_X * 2, h - PITCH_PADDING_TOP - PITCH_PADDING_BOTTOM)
          .stroke();

        const pitchW = w - PITCH_PADDING_X * 2;
        const pitchH = h - PITCH_PADDING_TOP - PITCH_PADDING_BOTTOM;
        const cx = PITCH_PADDING_X + pitchW / 2;
        const cy = PITCH_PADDING_TOP + pitchH / 2;

        lines.moveTo(PITCH_PADDING_X, cy).lineTo(w - PITCH_PADDING_X, cy).stroke();
        lines.circle(cx, cy, Math.min(pitchW, pitchH) * 0.13).stroke();
        lines.circle(cx, cy, 3).fill({ color: 0xffffff, alpha: 0.9 });

        const boxW = pitchW * 0.42;
        const boxH = pitchH * 0.16;
        lines.rect(cx - boxW / 2, PITCH_PADDING_TOP, boxW, boxH).stroke();
        lines.rect(cx - boxW / 2, h - PITCH_PADDING_BOTTOM - boxH, boxW, boxH).stroke();

        const sixW = boxW * 0.45;
        const sixH = boxH * 0.45;
        lines.rect(cx - sixW / 2, PITCH_PADDING_TOP, sixW, sixH).stroke();
        lines.rect(cx - sixW / 2, h - PITCH_PADDING_BOTTOM - sixH, sixW, sixH).stroke();

        // Penalty spots
        lines.circle(cx, PITCH_PADDING_TOP + boxH * 0.65, 2).fill({ color: 0xffffff, alpha: 0.9 });
        lines.circle(cx, h - PITCH_PADDING_BOTTOM - boxH * 0.65, 2).fill({ color: 0xffffff, alpha: 0.9 });

        // Corner arcs
        const arcR = 7;
        lines.arc(PITCH_PADDING_X, PITCH_PADDING_TOP, arcR, 0, Math.PI / 2).stroke();
        lines.arc(w - PITCH_PADDING_X, PITCH_PADDING_TOP, arcR, Math.PI / 2, Math.PI).stroke();
        lines.arc(PITCH_PADDING_X, h - PITCH_PADDING_BOTTOM, arcR, -Math.PI / 2, 0).stroke();
        lines.arc(w - PITCH_PADDING_X, h - PITCH_PADDING_BOTTOM, arcR, Math.PI, -Math.PI / 2).stroke();

        pitchLayer.addChild(grass, vignette, lines);
      };

      drawPitch();

      const updateSlotPosition = (s: SlotInstance) => {
        const w = app.canvas.width / app.renderer.resolution;
        const h = app.canvas.height / app.renderer.resolution;
        const pitchW = w - PITCH_PADDING_X * 2;
        const pitchH = h - PITCH_PADDING_TOP - PITCH_PADDING_BOTTOM;
        const px = PITCH_PADDING_X + s.x * pitchW;
        const py = h - PITCH_PADDING_BOTTOM - s.y * pitchH;
        s.ring.position.set(px, py);
        s.badge.position.set(px, py);
        s.initials.position.set(px, py);
        s.fitnessRing.position.set(px, py);
        s.numberLabel.position.set(px, py - 28);
        s.nameLabel.position.set(px, py + 32);
        s.formChip.position.set(px - 18, py + 22);
        s.positionGlow.position.set(px, py);
        s.warningGlow.position.set(px, py);
        s.selectGlow.position.set(px, py);
        s.hit.position.set(px, py);
      };

      const renderSlot = (s: SlotInstance) => {
        const { players, primaryColor } = propsRef.current;
        const occ = s.occupant;
        const player = occ ? players.find((p) => p.id === occ) : undefined;

        const pColor = parseInt(primaryColor.replace("#", ""), 16) || 0x36b87a;

        // Modern circular shirt token with a club-coloured fill, white
        // outline, and subtle drop shadow.
        s.ring.clear();
        if (player) {
          s.ring.circle(0, 0, 24).fill({ color: 0x000000, alpha: 0.35 });
          s.ring.circle(0, 0, 22).fill({ color: pColor });
          s.ring.circle(0, 0, 22).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
        } else {
          s.ring.circle(0, 0, 22).fill({ color: 0x183824, alpha: 0.55 });
          s.ring.circle(0, 0, 22).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
        }

        s.badge.clear();
        if (player) {
          // A subtle inner highlight ring for a polished, modern look.
          s.badge.circle(0, 0, 18).stroke({ width: 1, color: 0xffffff, alpha: 0.18 });
        }

        s.initials.text = player ? player.lastName.slice(0, 3).toUpperCase() : s.position;
        s.initials.style.fontSize = player ? 12 : 12;
        s.initials.style.fill = player ? "#0a1d12" : "#a3c8b5";

        s.positionGlow.clear();
        if (player) {
          const slotBroad = detailedToBroad(s.position as never);
          if (player.position !== slotBroad) {
            s.positionGlow.circle(0, 0, 26).stroke({ width: 2, color: 0xffcc44, alpha: 0.85 });
          }
        }

        s.warningGlow.clear();
        if (player) {
          if (player.isInjured) {
            s.warningGlow.circle(0, 0, 28).stroke({ width: 3, color: 0xe83a3a, alpha: 0.9 });
          } else if (player.isSuspended) {
            s.warningGlow.circle(0, 0, 28).stroke({ width: 3, color: 0xffcc44, alpha: 0.9 });
          } else if (player.fitness < 70) {
            s.warningGlow.circle(0, 0, 28).stroke({ width: 2, color: 0xff8a3a, alpha: 0.85 });
          }
        }

        // Fitness as an arc that fills clockwise around the token.
        s.fitnessRing.clear();
        if (player) {
          const fit = Math.max(0, Math.min(100, player.fitness));
          const angle = (fit / 100) * Math.PI * 2;
          const arcColor = fit >= 75 ? 0x3ad07f : fit >= 50 ? 0xf5cf63 : 0xe83a3a;
          s.fitnessRing
            .arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + angle)
            .stroke({ width: 3, color: arcColor, alpha: 0.95 });
        }

        // Form pill below the token.
        s.formChip.clear();
        if (player) {
          const formColor =
            player.form >= 75 ? 0x3ad07f :
            player.form >= 55 ? 0xf5cf63 :
            0xe83a3a;
          s.formChip.roundRect(0, 0, 36, 4, 2).fill({ color: formColor });
        }

        // Selected outline (tap-to-swap mode) — soft gold halo.
        s.selectGlow.clear();
        if (selectedSlotId === s.slotId) {
          s.selectGlow.circle(0, 0, 30).stroke({ width: 2, color: 0xf5cf63, alpha: 1 });
          s.selectGlow.circle(0, 0, 34).stroke({ width: 1, color: 0xf5cf63, alpha: 0.45 });
        }
      };

      const findSlotUnder = (gx: number, gy: number, max = SLOT_HIT_RADIUS): SlotInstance | null => {
        let best: SlotInstance | null = null;
        let bestDist = max;
        slotInstances.forEach((s) => {
          const dx = s.hit.position.x - gx;
          const dy = s.hit.position.y - gy;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) {
            bestDist = d;
            best = s;
          }
        });
        return best;
      };

      const clearSelection = () => {
        if (!selectedSlotId) return;
        selectedSlotId = null;
        slotInstances.forEach(renderSlot);
      };

      const setSelection = (slotId: string | null) => {
        selectedSlotId = slotId;
        slotInstances.forEach(renderSlot);
      };

      // Per-slot interaction is wired here. Each slot has an INVISIBLE
      // container with an explicit hitArea Circle so Pixi v8 can reliably
      // hit-test it regardless of fill alpha.
      const buildSlots = () => {
        slotLayer.removeChildren();
        slotInstances.length = 0;
        const formation = propsRef.current.formation;

        for (const slot of formation.slots) {
          const positionGlow = new PIXI.Graphics();
          const warningGlow = new PIXI.Graphics();
          const fitnessRing = new PIXI.Graphics();
          const ring = new PIXI.Graphics();
          const badge = new PIXI.Graphics();
          const selectGlow = new PIXI.Graphics();

          const initials = new PIXI.Text({
            text: slot.position,
            style: {
              fontFamily: 'ui-monospace, "Geist Mono", monospace',
              fontSize: 12,
              fill: "#a3c8b5",
              align: "center",
              fontWeight: "bold",
            },
          });
          initials.anchor.set(0.5);

          const numberLabel = new PIXI.Text({
            text: "",
            style: {
              fontFamily: '"VT323", ui-monospace, monospace',
              fontSize: 16,
              fill: "#f5cf63",
              fontWeight: "bold",
              stroke: { color: "#0a1d12", width: 3 },
            },
          });
          numberLabel.anchor.set(0.5);

          const nameLabel = new PIXI.Text({
            text: "",
            style: {
              fontFamily: '"Pixelify Sans", system-ui, sans-serif',
              fontSize: 12,
              fill: "#e9f3ec",
              fontWeight: "700",
              stroke: { color: "#0a1d12", width: 3 },
            },
          });
          nameLabel.anchor.set(0.5);

          const formChip = new PIXI.Graphics();

          const hit = new PIXI.Container();
          hit.eventMode = "static";
          hit.cursor = "grab";
          hit.hitArea = new PIXI.Circle(0, 0, SLOT_HIT_RADIUS);

          slotLayer.addChild(
            positionGlow,
            warningGlow,
            fitnessRing,
            ring,
            badge,
            selectGlow,
            initials,
            numberLabel,
            formChip,
            nameLabel,
            hit, // last so it's on top of everything visually it covers
          );

          const inst: SlotInstance = {
            slotId: slot.id,
            position: slot.position,
            x: slot.x,
            y: slot.y,
            positionGlow, warningGlow, fitnessRing, ring, badge,
            initials, numberLabel, nameLabel, formChip, selectGlow, hit,
            occupant: propsRef.current.starters[slot.id] ?? null,
          };
          slotInstances.push(inst);

          hit.on("pointerdown", (e) => {
            e.stopPropagation();
            const player = inst.occupant
              ? propsRef.current.players.find((p) => p.id === inst.occupant)
              : undefined;

            // Build a drag ghost regardless — if the user only taps, we tear
            // it down and treat it as a click. Empty slots can still BE the
            // destination of a drag; they don't START one.
            if (!player) {
              // Tap-to-swap fallback: if a slot is currently selected, swap
              // selection into this empty slot.
              if (selectedSlotId && selectedSlotId !== inst.slotId) {
                propsRef.current.onSwap(selectedSlotId, inst.slotId);
                clearSelection();
              }
              return;
            }

            const ghost = new PIXI.Container();
            const ghostRing = new PIXI.Graphics();
            ghostRing.circle(0, 0, 24).fill({ color: 0x000000, alpha: 0.4 });
            ghostRing.circle(0, 0, 22).fill({ color: 0xf5cf63, alpha: 0.95 });
            ghostRing.circle(0, 0, 22).stroke({ width: 2, color: 0xffffff });
            const ghostText = new PIXI.Text({
              text: player.lastName.slice(0, 3).toUpperCase(),
              style: {
                fontFamily: 'ui-monospace, "Geist Mono", monospace',
                fontSize: 12,
                fill: "#0a1d12",
                fontWeight: "bold",
              },
            });
            ghostText.anchor.set(0.5);
            ghost.addChild(ghostRing, ghostText);
            ghost.alpha = 0.95;
            ghost.position.copyFrom(e.global);
            dragLayer.addChild(ghost);

            drag = {
              fromSlotId: inst.slotId,
              ghost,
              startPointer: { x: e.global.x, y: e.global.y },
              moved: false,
            };

            ring.alpha = 0.35;
            badge.alpha = 0.35;
            initials.alpha = 0.35;
            hit.cursor = "grabbing";
          });
        }
      };

      buildSlots();
      slotInstances.forEach((s) => { updateSlotPosition(s); renderSlot(s); });

      // Use globalpointermove so we keep tracking the pointer when it's not
      // over an interactive child (the whole point of v8's globalpointermove).
      const onGlobalMove = (e: PIXI.FederatedPointerEvent) => {
        if (!drag) return;
        const dx = e.global.x - drag.startPointer.x;
        const dy = e.global.y - drag.startPointer.y;
        if (!drag.moved && Math.hypot(dx, dy) > TAP_THRESHOLD) {
          drag.moved = true;
        }
        drag.ghost.position.copyFrom(e.global);
      };

      const finishDrag = (e: PIXI.FederatedPointerEvent) => {
        if (!drag) return;
        const fromSlot = slotInstances.find((s) => s.slotId === drag!.fromSlotId);
        const wasMoved = drag.moved;

        // Tear down the ghost and visual state regardless of outcome.
        const cleanup = () => {
          if (!drag) return;
          if (fromSlot) {
            fromSlot.ring.alpha = 1;
            fromSlot.badge.alpha = 1;
            fromSlot.initials.alpha = 1;
            fromSlot.hit.cursor = "grab";
          }
          dragLayer.removeChild(drag.ghost);
          drag.ghost.destroy({ children: true });
          drag = null;
        };

        if (!fromSlot) { cleanup(); return; }

        if (!wasMoved) {
          // Treat as a tap. Toggle selection / perform swap.
          if (selectedSlotId === fromSlot.slotId) {
            clearSelection();
          } else if (selectedSlotId) {
            propsRef.current.onSwap(selectedSlotId, fromSlot.slotId);
            clearSelection();
          } else {
            setSelection(fromSlot.slotId);
          }
          cleanup();
          return;
        }

        // Drag was moved — find drop target.
        const target = findSlotUnder(e.global.x, e.global.y);
        if (target && target.slotId !== fromSlot.slotId) {
          propsRef.current.onSwap(fromSlot.slotId, target.slotId);
          clearSelection();
          cleanup();
          return;
        }

        // Dropped well off-pitch -> remove from lineup.
        const dropDist = Math.hypot(
          e.global.x - fromSlot.hit.position.x,
          e.global.y - fromSlot.hit.position.y,
        );
        if (dropDist > 80) {
          propsRef.current.onRemove(fromSlot.slotId);
          clearSelection();
        }
        cleanup();
      };

      stage.on("globalpointermove", onGlobalMove);
      stage.on("pointerup", finishDrag);
      stage.on("pointerupoutside", finishDrag);

      // Tapping empty pitch clears tap-selection.
      stage.on("pointerdown", (e) => {
        // If pointerdown didn't come from a slot, the slot's stopPropagation
        // wouldn't have fired and we should clear any pending selection.
        const slotHit = findSlotUnder(e.global.x, e.global.y);
        if (!slotHit && selectedSlotId) clearSelection();
      });

      cleanupTasks.push(() => {
        stage.off("globalpointermove", onGlobalMove);
        stage.off("pointerup", finishDrag);
        stage.off("pointerupoutside", finishDrag);
        stage.removeAllListeners("pointerdown");
      });

      ro = new ResizeObserver(() => {
        app.renderer.resize(host.clientWidth, host.clientHeight);
        drawPitch();
        slotInstances.forEach((s) => updateSlotPosition(s));
      });
      ro.observe(host);

      // Sync occupants from latest props every tick. Cheap because renderSlot
      // is no-op if nothing visually changed (Pixi rebatches automatically).
      let lastFormationKey = propsRef.current.formation.key;
      const update = () => {
        if (propsRef.current.formation.key !== lastFormationKey) {
          // Formation changed — rebuild slots.
          lastFormationKey = propsRef.current.formation.key;
          selectedSlotId = null;
          buildSlots();
          slotInstances.forEach((s) => { updateSlotPosition(s); renderSlot(s); });
          return;
        }
        slotInstances.forEach((s) => {
          s.occupant = propsRef.current.starters[s.slotId] ?? null;
          renderSlot(s);
        });
      };
      app.ticker.add(update);
      cleanupTasks.push(() => app.ticker.remove(update));
    })();

    return () => {
      mounted = false;
      cleanupTasks.forEach((f) => f());
      ro?.disconnect();
      try {
        app.destroy(true, { children: true, texture: true });
        if (app.canvas?.parentNode) app.canvas.parentNode.removeChild(app.canvas);
      } catch {
        // ignore
      }
    };
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}
