// =====================================================================
// SAVE ENGINE — IndexedDB-backed persistence with localStorage fallback.
//
// The world (80 clubs × ~25 players × multi-season history) routinely
// blows past localStorage's ~5 MB cap once the user is a few seasons in.
// When `setItem` throws QuotaExceededError, every subsequent save fails
// silently and the manager loses progress on every refresh — the user-
// visible symptom is "the league table reset to two games ago".
//
// IndexedDB has no practical size cap (it's allocated as a fraction of
// the disk, typically several gigabytes) and structured-clones the data
// directly, skipping the costly `JSON.stringify` round-trip entirely.
//
// The first time a returning user hits this version, their previous
// localStorage save is migrated transparently:
//   1. `loadGame()` checks IDB first, finds nothing, falls back to LS.
//   2. The store hydrates with the LS payload as before.
//   3. The next `saveGame()` writes to IDB and clears LS so the cap is
//      freed forever.
//
// Bumping `SAVE_VERSION` invalidates older saves whose schema is now
// stale. Don't do that lightly — pick the migration path in
// `gameStore.loadFromStorage` instead, which can patch missing fields.
// =====================================================================

import type { Career, GameDatabase, SerializedSave } from "@/types/game";

const DB_NAME = "gafferfc";
const DB_VERSION = 1;
const STORE_NAME = "saves";
const SAVE_KEY = "current";

// Legacy localStorage key — read on first load to migrate from the old
// backend, then deleted to free up the 5 MB cap.
const LS_KEY = "gafferfc:save:v1";
const SAVE_VERSION = 3;

// =====================================================================
// IDB helpers
// =====================================================================
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !window.indexedDB) {
    dbPromise = Promise.reject(new Error("IndexedDB unavailable"));
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  // If open ever fails, allow a retry on next call.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function idbPut(key: string, value: unknown): Promise<void> {
  return openDb().then((db) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    })
  );
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDb().then((db) =>
    new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    })
  );
}

function idbDelete(key: string): Promise<void> {
  return openDb().then((db) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })
  );
}

// =====================================================================
// localStorage fallback — only used when IDB is unavailable, and as the
// migration source when an old save predates this change.
// =====================================================================
function saveGameLS(payload: SerializedSave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("[Gaffer FC] localStorage fallback save failed", err);
  }
}

function loadGameLS(): SerializedSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SerializedSave;
    if (!parsed || parsed.version !== SAVE_VERSION) {
      window.localStorage.removeItem(LS_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearLS(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(LS_KEY); } catch { /* swallow */ }
}

function isValidSave(p: SerializedSave | null): SerializedSave | null {
  if (!p || p.version !== SAVE_VERSION) return null;
  return p;
}

// =====================================================================
// Public API
// =====================================================================

/**
 * Persist the current career + world. Async (IDB is async by nature),
 * but call sites generally don't need to await — the next read will
 * get the new value as long as the user hasn't already navigated away.
 *
 * IndexedDB transactions started before `beforeunload` are kept alive
 * by the browser until they commit, so even fire-and-forget calls
 * during a tab close write reliably.
 */
export async function saveGame(career: Career, db: GameDatabase): Promise<void> {
  if (typeof window === "undefined") return;
  const payload: SerializedSave = {
    version: SAVE_VERSION,
    career: { ...career, updatedAt: new Date().toISOString() },
    db,
  };
  try {
    await idbPut(SAVE_KEY, payload);
    // Once IDB has the data, clean up any leftover LS save so we
    // don't ever try to migrate it again — and free the 5 MB cap.
    clearLS();
  } catch (err) {
    console.warn("[Gaffer FC] IDB save failed, falling back to localStorage", err);
    saveGameLS(payload);
  }
}

// =====================================================================
// Debounced saver — keeps the UI fluid during rapid edits like
// drag-and-drop on the tactics board. We coalesce many mutations into
// one save and run inside `requestIdleCallback` when available.
// =====================================================================
const SAVE_DEBOUNCE_MS = 500;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { career: Career; db: GameDatabase } | null = null;
let inFlightSave: Promise<void> | null = null;
let unloadHookInstalled = false;

export function scheduleSave(career: Career, db: GameDatabase): void {
  if (typeof window === "undefined") return;
  pending = { career, db };

  if (!unloadHookInstalled) {
    unloadHookInstalled = true;
    // If the user closes the tab mid-debounce we still want to persist.
    // Fire-and-forget — IDB transactions started here keep the page
    // alive long enough to commit.
    window.addEventListener("beforeunload", () => { void flushSave(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flushSave();
    });
  }

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    runPendingSave();
  }, SAVE_DEBOUNCE_MS);
}

function runPendingSave(): void {
  if (!pending) return;
  const { career, db } = pending;
  pending = null;

  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;

  const run = () => {
    inFlightSave = saveGame(career, db).finally(() => {
      inFlightSave = null;
    });
  };

  if (typeof ric === "function") {
    ric(run, { timeout: 1500 });
  } else {
    setTimeout(run, 0);
  }
}

/**
 * Force any queued save to run. Returns a promise that resolves when
 * the write commits. Safe to call from `beforeunload` (fire-and-forget)
 * or `await`-ed at boundaries that need persistence guarantees.
 */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pending) {
    const { career, db } = pending;
    pending = null;
    inFlightSave = saveGame(career, db).finally(() => {
      inFlightSave = null;
    });
  }
  if (inFlightSave) {
    try { await inFlightSave; } catch { /* already logged */ }
  }
}

/**
 * Read the current save. Tries IDB first; falls back to localStorage
 * for one-time migration of saves that predate the IDB switchover.
 * On a successful LS-only read the next save will move the data into
 * IDB and clear LS.
 */
export async function loadGame(): Promise<SerializedSave | null> {
  if (typeof window === "undefined") return null;
  // Prefer IDB.
  if (window.indexedDB) {
    try {
      const fromIdb = await idbGet<SerializedSave>(SAVE_KEY);
      const validIdb = isValidSave(fromIdb);
      if (validIdb) return validIdb;
    } catch (err) {
      console.warn("[Gaffer FC] IDB load failed, trying localStorage", err);
    }
  }
  // Migration / fallback path.
  const fromLs = loadGameLS();
  return isValidSave(fromLs);
}

export async function clearSave(): Promise<void> {
  if (typeof window === "undefined") return;
  try { await idbDelete(SAVE_KEY); } catch { /* fine — db may not exist yet */ }
  clearLS();
}

export async function hasSave(): Promise<boolean> {
  return (await loadGame()) !== null;
}
