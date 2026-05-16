"use client";

// =====================================================================
// <PlayerPopoverHost /> — the single place in the tree that renders the
// player quick-stats popover whenever the popover store has an active
// target. Mount once in <AppShell /> and any <PlayerLink /> on any
// screen "just works".
//
// We resolve the player from the global game DB so callers only have
// to know the player id — they don't need to pass the full Player
// object through multiple component layers.
// =====================================================================

import { useRouter } from "next/navigation";
import { PlayerStatPopover } from "@/components/game/PlayerStatPopover";
import { toast } from "@/components/game/Toaster";
import { useGame } from "@/store/gameStore";
import { usePopoverStore } from "@/store/popoverStore";

export function PlayerPopoverHost() {
  const router = useRouter();
  const current = usePopoverStore((s) => s.current);
  const close = usePopoverStore((s) => s.close);
  const player = useGame((s) =>
    current ? s.db?.players[current.playerId] ?? null : null,
  );
  const lineup = useGame((s) => s.getUserLineup)();
  const userClub = useGame((s) => s.getUserClub)();
  // Subscribe to the scouted-id list so the popover re-renders the
  // moment "Send Scout" is clicked (instead of staying fogged until
  // the next mount).
  const isScouted = useGame((s) =>
    current ? s.isPlayerScouted(current.playerId) : false,
  );
  const scoutPlayer = useGame((s) => s.scoutPlayer);

  if (!current || !player) return null;

  const isOwn = !!userClub && player.clubId === userClub.id;
  // Captain only matters for the user's own players.
  const isCaptain = isOwn && lineup?.captainId === player.id;

  return (
    <PlayerStatPopover
      player={player}
      anchor={current.anchor}
      isCaptain={isCaptain}
      isScouted={isScouted}
      onSendScout={() => {
        scoutPlayer(player.id);
        toast(`${player.lastName} scouted`, "success");
      }}
      onClose={close}
      onMakeBid={
        isOwn
          ? undefined
          : () => {
              close();
              router.push(`/bid/${player.id}`);
            }
      }
    />
  );
}
