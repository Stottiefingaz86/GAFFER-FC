// =====================================================================
// Loading state for /match.
//
// The match page pulls in the heavy Pixi viewer chunk on top of the
// usual chrome, so the click-to-paint gap can be a beat. A simple
// retro shell keeps the screen feeling responsive while the bundle
// + DB selectors warm up.
// =====================================================================

export default function MatchLoading() {
  return (
    <div className="space-y-3 max-w-3xl mx-auto px-3 py-3">
      <div className="panel overflow-hidden animate-pulse">
        <div className="panel-bar h-8" />
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-stretch h-32 bg-[color:var(--ss-bg-deep)]"
          aria-hidden
        >
          <div className="bg-[color:var(--ss-row)]" />
          <div className="bg-[color:var(--ss-bg-deep)] w-24" />
          <div className="bg-[color:var(--ss-row-2)]" />
        </div>
        <div className="bg-[color:var(--ss-bar)] h-6" />
        <div className="bg-[color:var(--ss-bg-2)] h-24" />
        <div className="grid grid-cols-2 gap-[2px] bg-[color:var(--ss-bg-deep)]">
          <div className="bg-[color:var(--ss-row)] h-14" />
          <div className="bg-[color:var(--ss-row-2)] h-14" />
        </div>
      </div>

      <div className="text-center text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
        Loading matchday…
      </div>
    </div>
  );
}
