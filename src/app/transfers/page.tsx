"use client";

import { AppShell } from "@/components/game/AppShell";
import { Placeholder } from "@/components/game/Placeholder";

export default function TransfersPage() {
  return (
    <AppShell>
      <Placeholder
        title="Transfer Market"
        subtitle="Phase 2 unlocks the transfer board: shortlist players, make bids, negotiate wages, and chase deadline-day bargains. The data model is already in place."
        items={[
          { label: "Available Players", description: "Filter by position, age, value, potential." },
          { label: "Shortlist", description: "Track interest and watch wages climb." },
          { label: "Make Bid", description: "Negotiate fee, structure, and bonuses." },
          { label: "Rival Interest", description: "Watch as bigger clubs hijack your deal." },
        ]}
      />
    </AppShell>
  );
}
