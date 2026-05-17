// =====================================================================
// Loading state for /club/[clubId].
//
// Next.js automatically renders this while the dynamic route segment
// is mounting + hydrating. With 30k+ players in the database, the
// initial render of the club page (squad table, fixtures grid,
// transfer-interest panels) can take a beat — surfacing a clear
// retro-styled skeleton keeps the UI feeling instant.
// =====================================================================

export default function ClubLoading() {
  return (
    <div className="space-y-3 max-w-4xl mx-auto px-3 py-3">
      <div className="panel overflow-hidden animate-pulse">
        <div className="panel-bar h-8" />
        <div className="bg-[color:var(--ss-bg-deep)] h-24" />
        <div className="bg-[color:var(--ss-bg-2)] h-12 grid grid-cols-4 gap-[2px]">
          <div className="bg-[color:var(--ss-bg-deep)]" />
          <div className="bg-[color:var(--ss-bg-deep)]" />
          <div className="bg-[color:var(--ss-bg-deep)]" />
          <div className="bg-[color:var(--ss-bg-deep)]" />
        </div>
      </div>

      <div className="panel overflow-hidden animate-pulse">
        <div className="panel-bar h-6" />
        <ul>
          {Array.from({ length: 8 }).map((_, i) => (
            <li
              key={i}
              className="h-9 border-b border-[color:var(--ss-bg-deep)]"
              style={{ background: i % 2 ? "var(--ss-row)" : "var(--ss-row-2)" }}
            />
          ))}
        </ul>
      </div>

      <div className="text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
        Loading squad…
      </div>
    </div>
  );
}
