"use client";

import { AppShell } from "@/components/game/AppShell";
import { Placeholder } from "@/components/game/Placeholder";

export default function TrainingPage() {
  return (
    <AppShell>
      <Placeholder
        title="Training"
        subtitle="Phase 2 introduces weekly training focuses that buff form, sharpness, recovery, or wonderkid development."
        items={[
          { label: "Finishing", description: "Sharpens attackers ahead of a goal-shy spell." },
          { label: "Defending", description: "Tightens the unit before tough away days." },
          { label: "Set Pieces", description: "Boosts corners and free kicks." },
          { label: "Recovery", description: "Reduces fatigue and minor injury risk." },
          { label: "Youth Development", description: "Accelerates wonderkid growth." },
          { label: "Team Bonding", description: "Improves morale and chemistry." },
        ]}
      />
    </AppShell>
  );
}
