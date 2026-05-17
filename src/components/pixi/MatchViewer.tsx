"use client";

// =====================================================================
// <MatchViewer /> — PixiJS-powered 2D highlight viewer.
//
// Drop-in replacement for the legacy <PitchSimulator />. Same prop
// surface so the match page doesn't change shape — but rather than
// running a continuous off-ball steering loop and rolling its own
// scripts, this viewer consumes the structured `result.highlights`
// feed produced by `engine/highlightGenerator.ts`.
//
// Each highlight is animated as a short, deliberate scene:
//
//   1. Both teams snap into their formation home positions (shifted
//      by phase + ball zone so the attacking side is committed forward
//      and the defending side compressed back).
//   2. The ball travels through the highlight's `animationPath`,
//      tweening one step at a time at the engine-supplied durations.
//   3. The shooter / assister / goalkeeper visibly move toward the
//      ball at the relevant steps so the eye tracks the action.
//   4. On the resolution step the viewer flashes a goal / save / miss
//      effect and either freezes briefly (goal) or rolls into the
//      next highlight.
//
// The viewer follows the parent's `tickIndex` — the surrounding HUD
// drives the commentary, scoreboard and clock through MatchEvents, so
// we only kick off the next highlight when the parent's minute crosses
// the highlight's minute. That keeps pitch + commentary in sync even
// when the user pauses, jumps speed, or makes a sub.
// =====================================================================

import { useEffect, useMemo, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  type Ticker,
} from "pixi.js";
import type {
  Club,
  Lineup,
  MatchEvent,
  MatchResult,
  Player,
} from "@/types/game";
import type {
  AnimationStep,
  FormationKey,
  HighlightEvent,
  PitchZone,
  TeamPhase,
} from "@/types/match";
import {
  getFormationPositions,
  getShiftedTeamShape,
  phaseForTeam,
  slotToPoint,
} from "@/engine/formationEngine";
import { zoneToPoint } from "@/utils/pitchZones";
import { readableOn } from "@/lib/color";

// =====================================================================
// PROPS — identical to <PitchSimulator /> so the match page is a
// one-line swap.
// =====================================================================
export interface MatchViewerProps {
  result: MatchResult;
  /** Current MatchEvent index from the parent's commentary feed. The
   * viewer reads the minute to decide which highlights have unlocked. */
  tickIndex: number;
  home: Club;
  away: Club;
  /** Whether the user manages the HOME side. Drives team-colour roles
   * (your kit always renders prominently). */
  userIsHome: boolean;
  homeLineup?: Lineup;
  awayLineup?: Lineup;
  players?: Record<string, Player>;
  /** Whether the parent is currently advancing (resume = true,
   * pause = false). When paused we freeze the Pixi ticker. */
  running: boolean;
}

// =====================================================================
// CONSTANTS
// =====================================================================

/** Pitch coordinates run 0..100 in BOTH axes from the user's POV:
 *  x = lateral (0 left touchline → 100 right touchline)
 *  y = depth  (0 user's own goal line → 100 opposition goal line)
 *
 *  The Pixi canvas is portrait (taller than wide) so y maps to screen
 *  vertical, inverted (user attacks UP). The zone system uses 100×100
 *  attacking-team POV (x = depth, y = lateral) so we transpose when
 *  rendering. */
const PITCH_INTERNAL_WIDTH = 100;
const PITCH_INTERNAL_HEIGHT = 100;

/** Player token sizes — tuned so 22 tokens + a ball read clearly on a
 *  ~320×520 canvas. */
const PLAYER_RADIUS = 6;
const BALL_RADIUS = 3.5;
const GOAL_FLASH_DURATION = 1200;

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export function MatchViewer(props: MatchViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PixiEngine | null>(null);

  // The Pixi Application is created exactly once for the lifetime of
  // the component. All scene rebuilds happen INSIDE the engine on
  // prop changes — recreating PIXI.Application on each render is
  // surprisingly expensive and triggers WebGL context churn.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const engine = new PixiEngine();
    engine.mount(containerRef.current).then(() => {
      if (cancelled) {
        engine.destroy();
        return;
      }
      engineRef.current = engine;
      engine.setProps(props);
    });
    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new props into the engine on EVERY render — the engine
  // diffs internally to decide whether to rebuild teams or just
  // resume highlight playback.
  useEffect(() => {
    engineRef.current?.setProps(props);
  });

  // Stable wrapper props so the engine knows how to repaint without
  // having to re-read live data structures across the React boundary.
  const homeColor = props.home.badge.primaryColor;
  const awayColor = props.away.badge.primaryColor;
  const wrapperStyle = useMemo(() => ({
    "--home-kit": homeColor,
    "--away-kit": awayColor,
  } as React.CSSProperties), [homeColor, awayColor]);

  return (
    <div
      ref={containerRef}
      style={wrapperStyle}
      className="relative w-full aspect-[3/5] max-h-[640px] mx-auto bg-[#0a3a14] border-2 border-[color:var(--ss-bar-edge)] rounded-sm overflow-hidden"
    />
  );
}

// =====================================================================
// PIXI ENGINE — pure imperative class that owns the Application,
// scene graph, animation loop, and highlight queue. React just feeds
// it props.
// =====================================================================

interface RenderPlayer {
  player: Player;
  side: "home" | "away";
  slotId: string;
  /** Formation home position from the formation engine (in attacking
   *  POV — depth × lateral). */
  homeX: number;
  homeY: number;
  /** Current screen position, tweened during animations. */
  currentScreenX: number;
  currentScreenY: number;
  /** Where the ticker is tweening towards. */
  targetScreenX: number;
  targetScreenY: number;
  graphic: Graphics;
}

interface ActiveStep {
  step: AnimationStep;
  ballStart: { x: number; y: number };
  ballEnd: { x: number; y: number };
  playerStart?: { x: number; y: number };
  playerEnd?: { x: number; y: number };
  startedAt: number;
}

class PixiEngine {
  private app: Application | null = null;
  private pitchLayer: Container | null = null;
  private playerLayer: Container | null = null;
  private ballLayer: Container | null = null;
  private overlayLayer: Container | null = null;
  private ballGraphic: Graphics | null = null;
  private outcomeFlash: Graphics | null = null;
  private minuteText: Text | null = null;
  private actionText: Text | null = null;

  /** Players currently on-screen, indexed by their player.id. */
  private players: Map<string, RenderPlayer> = new Map();

  /** Last props snapshot — used to diff between renders. */
  private lastProps: MatchViewerProps | null = null;

  /** Highlights we've already played in this session. */
  private playedIds: Set<string> = new Set();

  /** Highlight currently animating (null between scenes). */
  private currentHighlight: HighlightEvent | null = null;
  private currentStepIndex = 0;
  private activeStep: ActiveStep | null = null;
  /** When a highlight finishes we hold the final pose for this long
   *  (gives the user a beat to read the commentary line). */
  private holdUntil = 0;

  /** Cached current canvas dimensions (set in mount + on resize). */
  private canvasW = 320;
  private canvasH = 520;

  // ── LIFECYCLE ───────────────────────────────────────────────────

  async mount(container: HTMLDivElement): Promise<void> {
    const rect = container.getBoundingClientRect();
    this.canvasW = Math.max(240, Math.floor(rect.width || 320));
    this.canvasH = Math.max(360, Math.floor(rect.height || 520));

    const app = new Application();
    await app.init({
      width: this.canvasW,
      height: this.canvasH,
      backgroundColor: 0x0a3a14,
      antialias: true,
      autoDensity: true,
      resolution: typeof window !== "undefined" ? window.devicePixelRatio : 1,
    });
    this.app = app;
    container.appendChild(app.canvas);
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.display = "block";

    // ── Scene graph ────
    this.pitchLayer = new Container();
    this.playerLayer = new Container();
    this.ballLayer = new Container();
    this.overlayLayer = new Container();
    app.stage.addChild(this.pitchLayer, this.playerLayer, this.ballLayer, this.overlayLayer);

    this.drawPitch();
    this.drawBall();
    this.drawOverlay();

    app.ticker.add(this.tick);
    // Resize-aware: rebuild pitch on container resize.
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => this.handleResize(container));
      ro.observe(container);
      this.resizeObserver = ro;
    }
  }

  private resizeObserver: ResizeObserver | null = null;

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.app) {
      this.app.ticker.remove(this.tick);
      // pixi v8: destroy with full chain so we don't leak WebGL.
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.players.clear();
    this.playedIds.clear();
    this.currentHighlight = null;
    this.activeStep = null;
  }

  private handleResize(container: HTMLDivElement): void {
    if (!this.app) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(240, Math.floor(rect.width));
    const h = Math.max(360, Math.floor(rect.height));
    if (w === this.canvasW && h === this.canvasH) return;
    this.canvasW = w;
    this.canvasH = h;
    this.app.renderer.resize(w, h);
    this.drawPitch();
    // Re-place players in their CURRENT (formation home) positions so
    // they sit correctly in the new canvas dimensions.
    if (this.lastProps) this.rebuildTeams(this.lastProps);
  }

  // ── PROP HANDLING ───────────────────────────────────────────────

  setProps(props: MatchViewerProps): void {
    if (!this.app) {
      this.lastProps = props;
      return;
    }
    const last = this.lastProps;
    this.lastProps = props;

    // ── Pause / resume ticker on `running` change. We use the
    //    parent's running flag so it stays in sync with the rest of
    //    the HUD (commentary feed pauses, viewer pauses too).
    if (props.running) this.app.ticker.start();
    else this.app.ticker.stop();

    // ── Rebuild teams whenever the result, lineups, or userIsHome
    //    change. New match = wipe history.
    const needsRebuild = !last
      || last.result.fixtureId !== props.result.fixtureId
      || last.homeLineup !== props.homeLineup
      || last.awayLineup !== props.awayLineup
      || last.userIsHome !== props.userIsHome;
    if (needsRebuild) {
      this.playedIds.clear();
      this.currentHighlight = null;
      this.activeStep = null;
      this.rebuildTeams(props);
      // Park ball at centre.
      this.setBallScreen(this.canvasW / 2, this.canvasH / 2);
    }

    // Update minute readout in the overlay.
    const minute = props.result.events[props.tickIndex]?.minute ?? 0;
    if (this.minuteText) this.minuteText.text = `${minute}'`;
  }

  // ── PITCH + BALL + OVERLAY DRAW ─────────────────────────────────

  private drawPitch(): void {
    if (!this.pitchLayer) return;
    this.pitchLayer.removeChildren();
    const w = this.canvasW;
    const h = this.canvasH;
    const g = new Graphics();

    // Background turf with alternating stripes.
    g.rect(0, 0, w, h).fill(0x0e4c1a);
    const stripeCount = 8;
    const stripeH = h / stripeCount;
    for (let i = 0; i < stripeCount; i++) {
      if (i % 2 === 0) {
        g.rect(0, i * stripeH, w, stripeH).fill(0x0b3f15);
      }
    }

    // Outer pitch boundary.
    g.rect(0, 0, w, h).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });

    // Halfway line + centre circle.
    g.moveTo(0, h / 2).lineTo(w, h / 2).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });
    g.circle(w / 2, h / 2, Math.min(w, h) * 0.10).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });
    g.circle(w / 2, h / 2, 2).fill(0xffffff);

    // Penalty boxes — at both ends. We keep the user attacking UP so
    // the bottom box is the user's defensive area.
    const boxW = w * 0.56;
    const boxH = h * 0.16;
    const boxX = (w - boxW) / 2;
    g.rect(boxX, h - boxH, boxW, boxH).stroke({ color: 0xffffff, width: 2, alpha: 0.85 }); // user's box
    g.rect(boxX, 0, boxW, boxH).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });        // opposition box

    // Six-yard boxes.
    const sixW = w * 0.34;
    const sixH = h * 0.07;
    const sixX = (w - sixW) / 2;
    g.rect(sixX, h - sixH, sixW, sixH).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });
    g.rect(sixX, 0, sixW, sixH).stroke({ color: 0xffffff, width: 2, alpha: 0.85 });

    // Penalty spots.
    g.circle(w / 2, h - h * 0.115, 2).fill(0xffffff);
    g.circle(w / 2, h * 0.115, 2).fill(0xffffff);

    // Goals — small posts above and below the pitch.
    const goalW = w * 0.18;
    const goalX = (w - goalW) / 2;
    g.rect(goalX, -4, goalW, 6).fill(0xffffff);
    g.rect(goalX, h - 2, goalW, 6).fill(0xffffff);

    this.pitchLayer.addChild(g);
  }

  private drawBall(): void {
    if (!this.ballLayer) return;
    this.ballLayer.removeChildren();
    const g = new Graphics();
    g.circle(0, 0, BALL_RADIUS + 1).fill(0x000000);
    g.circle(0, 0, BALL_RADIUS).fill(0xffffff);
    this.ballGraphic = g;
    this.ballLayer.addChild(g);
    this.setBallScreen(this.canvasW / 2, this.canvasH / 2);
  }

  private drawOverlay(): void {
    if (!this.overlayLayer) return;
    this.overlayLayer.removeChildren();
    const minuteStyle = new TextStyle({
      fontFamily: "monospace",
      fontWeight: "bold",
      fontSize: 14,
      fill: 0xffd000,
      stroke: { color: 0x000000, width: 3, join: "round" },
    });
    const minuteText = new Text({ text: "0'", style: minuteStyle });
    minuteText.x = 8;
    minuteText.y = 6;
    this.minuteText = minuteText;

    const actionStyle = new TextStyle({
      fontFamily: "monospace",
      fontWeight: "bold",
      fontSize: 11,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 3, join: "round" },
      align: "center",
      wordWrap: true,
      wordWrapWidth: this.canvasW - 16,
    });
    const actionText = new Text({ text: "", style: actionStyle });
    actionText.anchor.set(0.5, 0);
    actionText.x = this.canvasW / 2;
    actionText.y = this.canvasH - 30;
    this.actionText = actionText;

    // Outcome flash — full-canvas overlay shown briefly on goal/save.
    const flash = new Graphics();
    flash.rect(0, 0, this.canvasW, this.canvasH).fill({ color: 0xffffff, alpha: 0 });
    flash.alpha = 0;
    this.outcomeFlash = flash;

    this.overlayLayer.addChild(flash, minuteText, actionText);
  }

  // ── TEAM REBUILD ────────────────────────────────────────────────

  private rebuildTeams(props: MatchViewerProps): void {
    if (!this.playerLayer) return;
    this.playerLayer.removeChildren();
    this.players.clear();

    const homePlayers = collectStarters(props.homeLineup, props.players ?? {});
    const awayPlayers = collectStarters(props.awayLineup, props.players ?? {});
    const homeFormation = (props.homeLineup?.formationKey ?? "4-4-2") as FormationKey;
    const awayFormation = (props.awayLineup?.formationKey ?? "4-4-2") as FormationKey;

    // Assign each starter to a formation slot, role-aware.
    const homeAssignments = assignToFormation(homePlayers, homeFormation);
    const awayAssignments = assignToFormation(awayPlayers, awayFormation);

    const homeColor = parseColor(props.home.badge.primaryColor);
    const awayColor = parseColor(props.away.badge.primaryColor);
    const homeAccent = parseColor(readableOn(props.home.badge.primaryColor));
    const awayAccent = parseColor(readableOn(props.away.badge.primaryColor));

    // Render both teams. User's team attacks UP (toward y=0 on screen),
    // opposition attacks DOWN. We mirror the home team's slot y so
    // their attacking direction matches the user perspective.
    for (const a of homeAssignments) {
      const isUserTeam = props.userIsHome;
      const rp = this.createPlayer({
        player: a.player,
        side: "home",
        slotId: a.slotId,
        slotX: a.x,
        slotY: a.y,
        isUserTeam,
        fillColor: homeColor,
        strokeColor: a.player.position === "GK" ? 0xffd000 : homeAccent,
        labelColor: homeAccent,
      });
      this.players.set(a.player.id, rp);
      this.playerLayer.addChild(rp.graphic);
    }
    for (const a of awayAssignments) {
      const isUserTeam = !props.userIsHome;
      const rp = this.createPlayer({
        player: a.player,
        side: "away",
        slotId: a.slotId,
        slotX: a.x,
        slotY: a.y,
        isUserTeam,
        fillColor: awayColor,
        strokeColor: a.player.position === "GK" ? 0xffd000 : awayAccent,
        labelColor: awayAccent,
      });
      this.players.set(a.player.id, rp);
      this.playerLayer.addChild(rp.graphic);
    }

    // Initial pose — both teams in their formation home positions
    // with no ball-zone bias (neutral phase).
    this.snapToFormation(null, null);
  }

  private createPlayer(opts: {
    player: Player;
    side: "home" | "away";
    slotId: string;
    slotX: number;
    slotY: number;
    isUserTeam: boolean;
    fillColor: number;
    strokeColor: number;
    labelColor: number;
  }): RenderPlayer {
    const g = new Graphics();
    g.circle(0, 0, PLAYER_RADIUS + 1).fill(0x000000);
    g.circle(0, 0, PLAYER_RADIUS).fill(opts.fillColor).stroke({ color: opts.strokeColor, width: 1.4 });

    // Tiny shirt number / role chip — surface a meaningful label per
    // player so the user can tell tokens apart.
    const number = numberForPlayer(opts.player);
    const labelStyle = new TextStyle({
      fontFamily: "monospace",
      fontWeight: "bold",
      fontSize: 7,
      fill: opts.labelColor,
    });
    const text = new Text({ text: number, style: labelStyle });
    text.anchor.set(0.5);
    g.addChild(text);

    return {
      player: opts.player,
      side: opts.side,
      slotId: opts.slotId,
      homeX: opts.slotX,
      homeY: opts.slotY,
      currentScreenX: 0,
      currentScreenY: 0,
      targetScreenX: 0,
      targetScreenY: 0,
      graphic: g,
    };
  }

  /** Reset every player to their formation home position. Optionally
   *  shifted by ball zone for the attacking team. */
  private snapToFormation(
    ballZone: PitchZone | null,
    attackingSide: "home" | "away" | null,
  ): void {
    if (!this.lastProps) return;
    const props = this.lastProps;

    const homePlayers = [...this.players.values()].filter((p) => p.side === "home");
    const awayPlayers = [...this.players.values()].filter((p) => p.side === "away");

    const homePhase: TeamPhase = phaseForTeam(ballZone, attackingSide === "home");
    const awayPhase: TeamPhase = phaseForTeam(ballZone, attackingSide === "away");

    const homeShifted = getShiftedTeamShape(
      homePlayers.map((p) => ({
        id: p.slotId,
        role: "MID",
        detail: "CM",
        x: p.homeX,
        y: p.homeY,
      })),
      ballZone,
      homePhase,
    );
    const awayShifted = getShiftedTeamShape(
      awayPlayers.map((p) => ({
        id: p.slotId,
        role: "MID",
        detail: "CM",
        x: p.homeX,
        y: p.homeY,
      })),
      ballZone,
      awayPhase,
    );

    // Project each shifted slot into screen space, accounting for
    // which side is the user (user attacks UP).
    homePlayers.forEach((p, i) => {
      const slot = homeShifted[i];
      const { x, y } = projectSlot(slot.x, slot.y, "home", props.userIsHome, this.canvasW, this.canvasH);
      p.currentScreenX = x;
      p.currentScreenY = y;
      p.targetScreenX = x;
      p.targetScreenY = y;
      p.graphic.x = x;
      p.graphic.y = y;
    });
    awayPlayers.forEach((p, i) => {
      const slot = awayShifted[i];
      const { x, y } = projectSlot(slot.x, slot.y, "away", props.userIsHome, this.canvasW, this.canvasH);
      p.currentScreenX = x;
      p.currentScreenY = y;
      p.targetScreenX = x;
      p.targetScreenY = y;
      p.graphic.x = x;
      p.graphic.y = y;
    });
  }

  private setBallScreen(x: number, y: number): void {
    if (this.ballGraphic) {
      this.ballGraphic.x = x;
      this.ballGraphic.y = y;
    }
  }

  // ── ANIMATION LOOP ──────────────────────────────────────────────

  /** Per-frame tick. Driven by Pixi's ticker (paused when `running`
   *  is false). All time math runs off the ticker's delta. */
  private tick = (_ticker: Ticker): void => {
    if (!this.app || !this.lastProps) return;
    const props = this.lastProps;
    const now = performance.now();

    // Outcome flash fade-out.
    if (this.outcomeFlash && this.outcomeFlash.alpha > 0) {
      this.outcomeFlash.alpha = Math.max(0, this.outcomeFlash.alpha - 0.02);
    }

    // Smoothly tween non-involved players toward their target — the
    // shifted formation pose for the active highlight. Eases out so
    // the team shape feels alive rather than snapping each frame.
    for (const p of this.players.values()) {
      const dx = p.targetScreenX - p.currentScreenX;
      const dy = p.targetScreenY - p.currentScreenY;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        p.currentScreenX += dx * 0.12;
        p.currentScreenY += dy * 0.12;
        p.graphic.x = p.currentScreenX;
        p.graphic.y = p.currentScreenY;
      }
    }

    // ── Highlight playback state machine ────
    if (this.activeStep) {
      const step = this.activeStep;
      const elapsed = now - step.startedAt;
      const t = Math.min(1, elapsed / Math.max(1, step.step.durationMs));
      // Ball follows the step from→to.
      const bx = step.ballStart.x + (step.ballEnd.x - step.ballStart.x) * easeOut(t);
      const by = step.ballStart.y + (step.ballEnd.y - step.ballStart.y) * easeOut(t);
      this.setBallScreen(bx, by);

      // Step's playerId moves with the ball on carry/shot/etc.
      if (step.step.playerId && step.playerStart && step.playerEnd) {
        const pl = this.players.get(step.step.playerId);
        if (pl) {
          const px = step.playerStart.x + (step.playerEnd.x - step.playerStart.x) * easeOut(t);
          const py = step.playerStart.y + (step.playerEnd.y - step.playerStart.y) * easeOut(t);
          pl.currentScreenX = px;
          pl.currentScreenY = py;
          pl.targetScreenX = px;
          pl.targetScreenY = py;
          pl.graphic.x = px;
          pl.graphic.y = py;
        }
      }

      if (t >= 1) {
        // Step finished — fire any outcome FX.
        this.fireStepOutcome(step.step);
        this.advanceStep();
      }
      return;
    }

    // Holding the final pose of the previous highlight?
    if (now < this.holdUntil) return;

    // Decide whether to kick off the next highlight.
    this.maybeStartNextHighlight(props);
  };

  /** When a step completes, paint any one-shot effect (goal flash,
   *  save flash, miss puff). */
  private fireStepOutcome(step: AnimationStep): void {
    if (!this.outcomeFlash) return;
    switch (step.action) {
      case "goal":
        this.flash(0xffd000, 0.55);
        break;
      case "save":
        this.flash(0x39e0a0, 0.35);
        break;
      case "miss":
        this.flash(0xff6464, 0.30);
        break;
      case "card":
        this.flash(0xffd000, 0.45);
        break;
      case "injury":
        this.flash(0xff8e64, 0.30);
        break;
      default:
        break;
    }
  }

  private flash(color: number, alpha: number): void {
    if (!this.outcomeFlash || !this.app) return;
    this.outcomeFlash.clear();
    this.outcomeFlash.rect(0, 0, this.canvasW, this.canvasH).fill({ color, alpha: 1 });
    this.outcomeFlash.alpha = alpha;
  }

  /** Move to the next step in the active highlight (or end it). */
  private advanceStep(): void {
    if (!this.currentHighlight) {
      this.activeStep = null;
      return;
    }
    this.currentStepIndex += 1;
    const next = this.currentHighlight.animationPath[this.currentStepIndex];
    if (!next) {
      // Highlight finished — mark played, hold final pose briefly so
      // the user can read the commentary, then advance.
      this.playedIds.add(this.currentHighlight.id);
      const isGoal = this.currentHighlight.outcome === "goal";
      this.holdUntil = performance.now() + (isGoal ? GOAL_FLASH_DURATION + 200 : 350);
      this.currentHighlight = null;
      this.currentStepIndex = 0;
      this.activeStep = null;
      return;
    }
    this.startStep(next);
  }

  /** Build the per-step animation cache (ball start/end + optional
   *  player start/end) and capture the start timestamp. */
  private startStep(step: AnimationStep): void {
    if (!this.currentHighlight || !this.lastProps) return;
    const props = this.lastProps;
    const highlight = this.currentHighlight;
    const attackingSide: "home" | "away" =
      highlight.attackingTeamId === props.home.id ? "home" : "away";

    const ballStart = zoneToScreen(step.from, attackingSide, props.userIsHome, this.canvasW, this.canvasH);
    const ballEnd = zoneToScreen(step.to, attackingSide, props.userIsHome, this.canvasW, this.canvasH);
    let playerStart: { x: number; y: number } | undefined;
    let playerEnd: { x: number; y: number } | undefined;
    if (step.playerId) {
      const pl = this.players.get(step.playerId);
      if (pl) {
        playerStart = { x: pl.currentScreenX, y: pl.currentScreenY };
        // Players carrying the ball travel WITH it; passers stop
        // at the launch zone, shooters travel into the shot zone.
        playerEnd = step.action === "carry"
          ? ballEnd
          : step.action === "shot" || step.action === "header"
            ? ballEnd
            : ballStart;
      }
    }
    this.activeStep = { step, ballStart, ballEnd, playerStart, playerEnd, startedAt: performance.now() };
  }

  /** Look for the next highlight whose minute the parent has now
   *  unlocked, and start it. */
  private maybeStartNextHighlight(props: MatchViewerProps): void {
    const feed = props.result.highlights ?? [];
    if (feed.length === 0) return;
    const currentMinute = props.result.events[props.tickIndex]?.minute ?? 0;
    // Find the first unplayed highlight whose minute is <= current
    // unlock minute. We skip non-animating types (period markers,
    // substitutions) for the viewer's purposes.
    const next = feed.find(
      (h) => !this.playedIds.has(h.id)
        && h.minute <= currentMinute
        && h.type !== "kickoff"
        && h.type !== "half_time"
        && h.type !== "full_time"
        && h.type !== "substitution"
        && h.animationPath.length > 0,
    );
    if (!next) return;
    this.currentHighlight = next;
    this.currentStepIndex = 0;
    // Snap teams into the right shape for THIS highlight's attacking
    // side + start zone.
    const attackingSide: "home" | "away" =
      next.attackingTeamId === props.home.id ? "home" : "away";
    this.snapToFormation(next.startZone, attackingSide);
    if (this.actionText) {
      this.actionText.text = next.description;
      this.actionText.style.wordWrapWidth = this.canvasW - 16;
    }
    this.startStep(next.animationPath[0]);
  }
}

// =====================================================================
// PROJECTION HELPERS
//
// The Pixi canvas is portrait. The user's team always attacks UP, so:
//
//   • User-side player slot (x=depth, y=lateral) in attacking-team
//     POV → screen (canvasX = y/100 * W, canvasY = (1 - x/100) * H).
//   • Opposition-side player slot → mirrored: their x=0 (their goal)
//     sits at canvasY=0, their x=100 sits at canvasY=H.
//
// For HIGHLIGHT animation paths, the zones are in the ATTACKING team's
// POV. We project them based on whether the attacking team is the
// user's side (attacks UP) or the opposition (attacks DOWN).
// =====================================================================

function projectSlot(
  x: number,
  y: number,
  side: "home" | "away",
  userIsHome: boolean,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const isUserSide = (side === "home") === userIsHome;
  const screenX = (y / PITCH_INTERNAL_WIDTH) * canvasW;
  const screenY = isUserSide
    ? (1 - x / PITCH_INTERNAL_HEIGHT) * canvasH
    : (x / PITCH_INTERNAL_HEIGHT) * canvasH;
  return { x: screenX, y: screenY };
}

function zoneToScreen(
  zone: PitchZone,
  attackingSide: "home" | "away",
  userIsHome: boolean,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const attackingIsUser = (attackingSide === "home") === userIsHome;
  const direction = attackingIsUser ? "right" : "left";
  // zoneToPoint returns x in 0..100 attacking-team POV. We then map
  // (depth, lateral) → (screen x, screen y) treating user attacks UP.
  const p = zoneToPoint(zone, direction);
  // When attacker is user-side: the zone's x=depth grows toward user's
  // attacking goal (top of canvas). When attacker is opposition: zone
  // x grows toward opposition's attacking goal = canvas bottom. We
  // already pass direction="left" for opposition so zoneToPoint mirrors
  // x, but we still need to invert depth so the ball flows toward the
  // correct goal on screen.
  const screenX = (p.y / PITCH_INTERNAL_WIDTH) * canvasW;
  const screenY = attackingIsUser
    ? (1 - p.x / PITCH_INTERNAL_HEIGHT) * canvasH
    : (p.x / PITCH_INTERNAL_HEIGHT) * canvasH;
  return { x: screenX, y: screenY };
}

// =====================================================================
// LINEUP → SLOT ASSIGNMENT
//
// We match starters (in their detailedPosition) to the formation's
// slots so the back four really lines up at the back, midfielders in
// the middle, etc. The match-engine doesn't slot players onto formation
// IDs (it just picks 11), so we re-do the assignment here.
// =====================================================================

interface Assignment {
  player: Player;
  slotId: string;
  x: number;
  y: number;
}

function collectStarters(
  lineup: Lineup | undefined,
  registry: Record<string, Player>,
): Player[] {
  if (!lineup) return [];
  return Object.values(lineup.starters)
    .map((id) => registry[id])
    .filter((p): p is Player => Boolean(p));
}

function assignToFormation(players: Player[], formation: FormationKey): Assignment[] {
  const slots = getFormationPositions(formation);
  // Group slots + players by role and pair them off in order.
  const slotsByRole = bucketBy(slots, (s) => s.role);
  const playersByRole = bucketBy(players, (p) => p.position);

  const result: Assignment[] = [];
  (["GK", "DEF", "MID", "FWD"] as const).forEach((role) => {
    const roleSlots = slotsByRole.get(role) ?? [];
    const rolePlayers = playersByRole.get(role) ?? [];
    const n = Math.min(roleSlots.length, rolePlayers.length);
    for (let i = 0; i < n; i++) {
      const s = roleSlots[i];
      const p = rolePlayers[i];
      result.push({ player: p, slotId: s.id, x: s.x, y: s.y });
    }
  });
  // Fallback for mismatched lineups (e.g. 4-3-3 lineup vs 4-4-2
  // formation template). Stick leftover players into leftover slots
  // any-which-way so we still have 11 dots on the pitch.
  const placedIds = new Set(result.map((r) => r.player.id));
  const placedSlotIds = new Set(result.map((r) => r.slotId));
  const leftoverPlayers = players.filter((p) => !placedIds.has(p.id));
  const leftoverSlots = slots.filter((s) => !placedSlotIds.has(s.id));
  for (let i = 0; i < Math.min(leftoverPlayers.length, leftoverSlots.length); i++) {
    result.push({
      player: leftoverPlayers[i],
      slotId: leftoverSlots[i].id,
      x: leftoverSlots[i].x,
      y: leftoverSlots[i].y,
    });
  }
  return result;
}

function bucketBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return map;
}

// =====================================================================
// MISC
// =====================================================================

/** Crude shirt-number derivation — uses the player's position to pick
 *  a plausible number so labels look more "footbally" than just an
 *  index. */
function numberForPlayer(p: Player): string {
  switch (p.detailedPosition) {
    case "GK": return "1";
    case "CB": return p.id.length % 2 === 0 ? "4" : "5";
    case "LB": return "3";
    case "RB": return "2";
    case "DM": return "6";
    case "CM": return p.id.length % 2 === 0 ? "8" : "10";
    case "AM": return "10";
    case "LM": return "11";
    case "RM": return "7";
    case "LW": return "11";
    case "RW": return "7";
    case "ST": return p.id.length % 2 === 0 ? "9" : "10";
    case "CF": return "9";
  }
}

function parseColor(css: string): number {
  // Accept "#RRGGBB" or "RRGGBB". Default to white on parse failure.
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return 0xffffff;
  return parseInt(m[1], 16);
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Silence unused-import warning for slotToPoint (kept around as part
// of the formation engine's public API — useful from outside this
// file, e.g. UI tooling).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _slotToPoint = slotToPoint;
// Re-export the MatchEvent type ref just so an inadvertent build
// strip doesn't lose it — the prop type uses it transitively.
export type { MatchEvent };
