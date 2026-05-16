"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/game/AppShell";
import { useGame } from "@/store/gameStore";

export default function InboxPage() {
  return (
    <AppShell>
      <InboxInner />
    </AppShell>
  );
}

function InboxInner() {
  const inbox = useGame((s) => s.db?.inbox ?? []);
  const markRead = useGame((s) => s.markInboxRead);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = inbox.find((m) => m.id === openId) ?? null;
  const unread = inbox.filter((m) => !m.read).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3">
      <aside className="panel overflow-hidden max-h-[80vh] flex flex-col">
        <div className="panel-bar text-base flex items-center justify-between">
          <span>Inbox</span>
          {unread > 0 && (
            <span className="bg-[color:var(--ss-btn-exit)] text-white text-[10px] px-1.5 py-0.5 font-extrabold scoreboard">
              {unread}
            </span>
          )}
        </div>
        <div className="overflow-auto scrollbar-thin flex-1">
          {inbox.length === 0 ? (
            <div className="bg-[color:var(--ss-bg-2)] py-8 text-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
              Inbox empty
            </div>
          ) : (
            inbox.map((m, i) => {
              const selected = openId === m.id;
              const bg = selected
                ? "var(--ss-row-sel)"
                : !m.read
                  ? i % 2 === 0 ? "var(--ss-row)" : "var(--ss-row-2)"
                  : "var(--ss-bg-strip)";
              return (
                <button
                  key={m.id}
                  onClick={() => { setOpenId(m.id); markRead(m.id); }}
                  className="w-full text-left px-3 py-2 text-white"
                  style={{
                    background: bg,
                    boxShadow: selected ? "inset 4px 0 0 0 var(--ss-accent)" : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] uppercase tracking-[0.18em] text-white/75">
                      W{m.week} · {m.category}
                    </span>
                    {!m.read && <span className="size-2 bg-[color:var(--ss-accent)]" />}
                  </div>
                  <div className={`text-[12px] truncate font-bold uppercase tracking-[0.04em] ${!m.read ? "text-white" : "text-white/70"}`}>
                    {m.title}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key={open.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="panel overflow-hidden"
          >
            <div className="panel-bar text-base">
              S{open.season} · W{open.week} · {open.category.toUpperCase()}
            </div>
            <div className="bg-[color:var(--ss-row-bench)] px-5 py-4 text-white">
              <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-[0.04em]">{open.title}</h2>
            </div>
            <div className="bg-[color:var(--ss-bg-2)] p-5 text-sm leading-relaxed whitespace-pre-line text-white">
              {open.body}
            </div>
          </motion.div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="panel-bar text-base">Message</div>
            <div className="bg-[color:var(--ss-bg-2)] py-12 grid place-items-center text-[color:var(--muted)] text-xs uppercase tracking-[0.16em]">
              Select a message
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
