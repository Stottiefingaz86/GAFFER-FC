"use client";

import { AppShell } from "@/components/game/AppShell";
import { Placeholder } from "@/components/game/Placeholder";

export default function ClubPage() {
  return (
    <AppShell>
      <Placeholder
        title="Club Upgrades"
        subtitle="Phase 2 expands the club office: stadium expansions, training ground tiers, youth academy, scouting network, and commercial. Unlocks come with construction time and budget cost."
        items={[
          { label: "Stadium Capacity", description: "Bigger ticket revenue, louder home atmosphere." },
          { label: "Hospitality", description: "VIP boxes lift matchday revenue." },
          { label: "Pitch Quality", description: "Reduces injuries and weather chaos." },
          { label: "Training Ground", description: "Faster player development." },
          { label: "Youth Academy", description: "Generates new wonderkids each season." },
          { label: "Medical Centre", description: "Cuts injury length." },
          { label: "Scouting Network", description: "Better transfer recommendations." },
          { label: "Commercial Suite", description: "Sponsor income, club shop, media room." },
        ]}
      />
    </AppShell>
  );
}
