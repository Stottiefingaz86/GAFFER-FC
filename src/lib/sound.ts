// =====================================================================
// SOUND MANAGER — simple HTMLAudioElement-based singleton.
//
// Two-tier mixing:
//   - One-shots (kickoff, full time, free kick / injury / booking, swap,
//     button press) are short clips played via a small pool of
//     pre-loaded <audio> elements so we can fire several quickly without
//     truncating the previous one.
//   - Ambient is a single looping track (`big-game.mp3` for Premier and
//     European nights, `small-game.mp3` for the lower leagues). Starting
//     a new ambient cross-fades out the current one.
//
// Mute and volume are persisted to localStorage so the player's
// preference survives reloads. All public methods are no-ops on the
// server (Next.js can import this file from RSC code paths).
// =====================================================================

export type SoundKey =
  | "kickoff"
  | "fullTime"
  | "stoppage" // free kick / injury / booking
  | "swap"
  | "buttonPress"
  | "goal";

export type AmbientKey = "bigGame" | "smallGame";

const SRC: Record<SoundKey | AmbientKey, string> = {
  kickoff:     "/sounds/kick-off.mp3",
  fullTime:    "/sounds/full-time.mp3",
  stoppage:    "/sounds/freekick_injury_booking.mp3",
  swap:        "/sounds/player_change_swap.mp3",
  buttonPress: "/sounds/button-press.mp3",
  goal:        "/sounds/goal.mp3",
  bigGame:     "/sounds/big-game.mp3",
  smallGame:   "/sounds/small_game.mp3",
};

// Per-clip mix levels — ambience sits much lower so it doesn't drown
// the action SFX. Each one-shot is normalised against the ambient bed.
// Goals get a small boost since they're the headline moment of any match.
const CLIP_GAIN: Record<SoundKey | AmbientKey, number> = {
  kickoff:     1.0,
  fullTime:    1.0,
  stoppage:    0.85,
  swap:        0.6,
  buttonPress: 0.45,
  goal:        1.1,
  bigGame:     0.35,
  smallGame:   0.35,
};

const STORAGE_MUTE = "gfc:sound:mute";
const STORAGE_VOL  = "gfc:sound:vol";

interface State {
  muted: boolean;
  volume: number;            // 0..1, master multiplier on top of clip gain
  oneShotPools: Map<SoundKey, HTMLAudioElement[]>;
  ambient: HTMLAudioElement | null;
  ambientKey: AmbientKey | null;
  // One-shot fade timers we may need to cancel.
  fadeHandles: Set<number>;
}

let state: State | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function init(): State {
  if (state) return state;
  const muted = isBrowser() ? localStorage.getItem(STORAGE_MUTE) === "1" : false;
  const volRaw = isBrowser() ? localStorage.getItem(STORAGE_VOL) : null;
  const volume = volRaw === null ? 0.7 : Math.max(0, Math.min(1, parseFloat(volRaw)));
  state = {
    muted,
    volume,
    oneShotPools: new Map(),
    ambient: null,
    ambientKey: null,
    fadeHandles: new Set(),
  };
  return state;
}

/** Lazy-load a small pool of one-shot players so rapid-fire SFX work. */
function getOneShotInstance(key: SoundKey): HTMLAudioElement | null {
  if (!isBrowser()) return null;
  const s = init();
  let pool = s.oneShotPools.get(key);
  if (!pool) {
    pool = Array.from({ length: 3 }, () => {
      const a = new Audio(SRC[key]);
      a.preload = "auto";
      return a;
    });
    s.oneShotPools.set(key, pool);
  }
  // Pick the first instance not currently playing — falls back to
  // overwriting the oldest if all are busy.
  return pool.find((a) => a.paused || a.ended) ?? pool[0];
}

/** Play a one-shot sound. Honours mute and master volume. */
export function playSfx(key: SoundKey): void {
  if (!isBrowser()) return;
  const s = init();
  if (s.muted) return;
  const audio = getOneShotInstance(key);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.volume = s.volume * CLIP_GAIN[key];
    void audio.play().catch(() => {
      // Autoplay rejected — ignore silently. The next user gesture
      // will unlock the audio context for subsequent calls.
    });
  } catch {
    // Some browsers throw before play() resolves; nothing we can do.
  }
}

/** Start (or switch to) a looping ambient track with a short cross-fade. */
export function playAmbient(key: AmbientKey): void {
  if (!isBrowser()) return;
  const s = init();
  if (s.muted) {
    // Even when muted, remember which ambient should play so unmuting
    // resumes the right bed without the caller having to know.
    s.ambientKey = key;
    return;
  }
  if (s.ambientKey === key && s.ambient && !s.ambient.paused) return;

  // Fade out the previous ambient (if any) before swapping.
  const previous = s.ambient;
  if (previous) fadeOutAndStop(previous, 350);

  const next = new Audio(SRC[key]);
  next.loop = true;
  next.volume = 0;
  next.preload = "auto";
  s.ambient = next;
  s.ambientKey = key;
  void next.play()
    .then(() => fadeTo(next, s.volume * CLIP_GAIN[key], 600))
    .catch(() => {
      // Autoplay denied (no user gesture yet). The track will be
      // started on the next call after a click.
    });
}

/** Stop the current ambient with a short fade-out. */
export function stopAmbient(): void {
  if (!isBrowser()) return;
  const s = init();
  s.ambientKey = null;
  if (s.ambient) {
    fadeOutAndStop(s.ambient, 400);
    s.ambient = null;
  }
}

/** Toggle mute, persisted across reloads. */
export function setMuted(muted: boolean): void {
  if (!isBrowser()) return;
  const s = init();
  s.muted = muted;
  localStorage.setItem(STORAGE_MUTE, muted ? "1" : "0");
  if (muted && s.ambient) {
    fadeOutAndStop(s.ambient, 250);
    s.ambient = null;
  } else if (!muted && s.ambientKey) {
    // Resume whichever ambient was meant to be playing.
    playAmbient(s.ambientKey);
  }
}

export function getMuted(): boolean {
  return isBrowser() ? init().muted : false;
}

/** Set master volume in 0..1. Persisted across reloads. */
export function setVolume(v: number): void {
  if (!isBrowser()) return;
  const s = init();
  s.volume = Math.max(0, Math.min(1, v));
  localStorage.setItem(STORAGE_VOL, String(s.volume));
  if (s.ambient && s.ambientKey) {
    s.ambient.volume = s.volume * CLIP_GAIN[s.ambientKey];
  }
}

export function getVolume(): number {
  return isBrowser() ? init().volume : 0.7;
}

// =====================================================================
// Internals — small fade helpers so cross-fades feel smooth.
// =====================================================================

function fadeTo(audio: HTMLAudioElement, target: number, duration: number): void {
  const s = init();
  const start = audio.volume;
  const t0 = performance.now();
  const tick = () => {
    const t = (performance.now() - t0) / duration;
    if (t >= 1) {
      audio.volume = target;
      return;
    }
    audio.volume = start + (target - start) * t;
    const handle = window.requestAnimationFrame(tick);
    s.fadeHandles.add(handle);
  };
  tick();
}

function fadeOutAndStop(audio: HTMLAudioElement, duration: number): void {
  const s = init();
  const start = audio.volume;
  const t0 = performance.now();
  const step = () => {
    const t = (performance.now() - t0) / duration;
    if (t >= 1) {
      audio.volume = 0;
      audio.pause();
      audio.src = "";
      return;
    }
    audio.volume = start * (1 - t);
    const handle = window.requestAnimationFrame(step);
    s.fadeHandles.add(handle);
  };
  step();
}
