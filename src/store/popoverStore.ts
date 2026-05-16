// =====================================================================
// Player popover store — a single "currently-open" target so any screen
// in the app can request the global player popover without each page
// re-implementing modal state.
//
// Usage:
//   import { useOpenPlayerPopover } from "@/store/popoverStore";
//   const open = useOpenPlayerPopover();
//   <button onClick={(e) => open(p.id, e.currentTarget.getBoundingClientRect())}>
//     {p.lastName}
//   </button>
//
// And mount <PlayerPopoverHost /> once at the app root so it's available
// on every page.
// =====================================================================

import { create } from "zustand";

export interface OpenPopover {
  playerId: string;
  anchor: DOMRect | null;
}

interface PopoverStore {
  current: OpenPopover | null;
  open: (playerId: string, anchor?: DOMRect | null) => void;
  close: () => void;
}

export const usePopoverStore = create<PopoverStore>((set) => ({
  current: null,
  open: (playerId, anchor) => set({ current: { playerId, anchor: anchor ?? null } }),
  close: () => set({ current: null }),
}));

/** Convenience hook returning a single `open(playerId, anchor)` callback. */
export function useOpenPlayerPopover() {
  return usePopoverStore((s) => s.open);
}
