"use client";

import { AppShell } from "@/components/game/AppShell";
import { TeamCrest } from "@/components/game/TeamCrest";
import { ClubLink } from "@/components/game/ClubLink";
import { useGame } from "@/store/gameStore";
import { COMP_IDS } from "@/data/competitionSeeds";

const CUPS = [
  { id: COMP_IDS.NATIONAL_CUP, label: "National Cup", desc: "All 80 clubs · single-leg knockout" },
  { id: COMP_IDS.LEAGUE_CUP, label: "League Cup", desc: "All 80 clubs · single-leg knockout" },
  { id: COMP_IDS.CHAMPIONS_CUP, label: "Champions Cup", desc: "Top European clubs · groups + KO" },
  { id: COMP_IDS.CONTINENTAL_CUP, label: "Continental Cup", desc: "Secondary European · groups + KO" },
  { id: COMP_IDS.SUPER_SHIELD, label: "Super Shield", desc: "Super cup · season opener" },
];

export default function CupsPage() {
  return (
    <AppShell>
      <CupsInner />
    </AppShell>
  );
}

function CupsInner() {
  const db = useGame((s) => s.db)!;
  const userClub = useGame((s) => s.getUserClub)()!;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {CUPS.map((c) => {
        const comp = db.competitions[c.id];
        const fixtures = db.fixtures.filter((f) => f.competitionId === c.id);
        const userFix = fixtures.find((f) => f.homeId === userClub.id || f.awayId === userClub.id);
        const totalFixtures = fixtures.length;
        const playedFixtures = fixtures.filter((f) => f.played).length;

        return (
          <div key={c.id} className="panel overflow-hidden">
            <div className="panel-bar text-base">{c.label.toUpperCase()}</div>
            <div className="bg-[color:var(--ss-row-bench)] text-white px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/75">
                    {comp.type} · {comp.format}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.04em] mt-0.5 truncate">{c.desc}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-white/75">Played</div>
                  <div className="scoreboard font-extrabold">{playedFixtures}/{totalFixtures}</div>
                </div>
              </div>
            </div>

            {totalFixtures === 0 ? (
              <div className="bg-[color:var(--ss-bg-2)] px-4 py-6 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
                Bracket not drawn yet.
              </div>
            ) : (
              <>
                {userFix && (
                  <div
                    className="team-strip text-white px-4 py-2.5"
                    style={{ ["--team-1" as string]: userClub.badge.primaryColor }}
                  >
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/80">
                      Your Tie · {userFix.stage ?? `Round ${userFix.round}`} · Week {userFix.week}
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-1 font-bold uppercase tracking-[0.04em]">
                      <ClubLink clubId={userFix.homeId} className="flex items-center gap-2 min-w-0">
                        <TeamCrest club={db.clubs[userFix.homeId]} size={20} />
                        <span className="truncate" title={db.clubs[userFix.homeId].name}>
                          {db.clubs[userFix.homeId].name}
                        </span>
                      </ClubLink>
                      <span className="scoreboard text-base px-2 bg-[color:var(--ss-bg-deep)] shrink-0">
                        {userFix.played && userFix.result
                          ? `${userFix.result.homeGoals}-${userFix.result.awayGoals}`
                          : "VS"}
                      </span>
                      <ClubLink clubId={userFix.awayId} className="flex items-center gap-2 min-w-0 justify-end">
                        <span className="truncate" title={db.clubs[userFix.awayId].name}>
                          {db.clubs[userFix.awayId].name}
                        </span>
                        <TeamCrest club={db.clubs[userFix.awayId]} size={20} />
                      </ClubLink>
                    </div>
                  </div>
                )}

                <div className="max-h-56 overflow-auto scrollbar-thin">
                  {fixtures.slice(0, 12).map((f, i) => (
                    <div
                      key={f.id}
                      className="grid grid-cols-[1fr_56px_1fr] items-center gap-2 px-3 py-1.5 text-white text-[12px] font-bold uppercase tracking-[0.04em]"
                      style={{ background: i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)" }}
                    >
                      <ClubLink clubId={f.homeId} className="truncate">{db.clubs[f.homeId].name}</ClubLink>
                      <span className="scoreboard text-center text-white shrink-0">
                        {f.played && f.result ? `${f.result.homeGoals}-${f.result.awayGoals}` : "VS"}
                      </span>
                      <ClubLink clubId={f.awayId} className="truncate text-right block">{db.clubs[f.awayId].name}</ClubLink>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="panel md:col-span-2 overflow-hidden">
        <div className="panel-bar text-sm">Coming in Phase 2</div>
        <div className="bg-[color:var(--ss-bg-2)] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
          Continentals populate when you qualify. Phase 2 adds multi-leg rounds, replays and full brackets.
        </div>
      </div>
    </div>
  );
}
