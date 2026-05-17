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
import { formatValue } from "@/lib/playerValue";

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
  const scoutCost = useGame((s) =>
    current ? s.scoutCostFor(current.playerId) : 0,
  );
  const scoutPlayerPaid = useGame((s) => s.scoutPlayerPaid);

  if (!current || !player) return null;

  const isOwn = !!userClub && player.clubId === userClub.id;
  // Captain only matters for the user's own players.
  const isCaptain = isOwn && lineup?.captainId === player.id;
  const canAffordScout = !userClub || scoutCost === 0 || userClub.budget >= scoutCost;

  return (
    <PlayerStatPopover
      player={player}
      anchor={current.anchor}
      isCaptain={isCaptain}
      isScouted={isScouted}
      scoutCost={scoutCost}
      canAffordScout={canAffordScout}
      onSendScout={() => {
        const result = scoutPlayerPaid(player.id);
        if (result.ok) {
          toast(
            result.cost > 0
              ? `${player.lastName} scouted · ${formatValue(result.cost)} paid`
              : `${player.lastName} scouted`,
            "success",
          );
        } else if (result.reason === "insufficient") {
          toast(
            `Insufficient funds — need ${formatValue(result.cost)}`,
            "warn",
          );
        } else if (result.reason === "already") {
          toast(`${player.lastName} already scouted`, "info");
        } else {
          toast("Could not file scout report", "warn");
        }
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
