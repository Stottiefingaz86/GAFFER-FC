"use client";

import { create } from "zustand";
import { useEffect } from "react";

type ToastTone = "info" | "success" | "warn" | "error";

interface Toast {
  id: string;
  label: string;
  tone: ToastTone;
  timeout: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const store = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...t },
      ].slice(-5),
    })),
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(label: string, tone: ToastTone = "info", timeout = 2400) {
  store.getState().push({ label, tone, timeout });
}

export function Toaster() {
  const toasts = store((s) => s.toasts);
  const dismiss = store((s) => s.dismiss);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.timeout),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <div className="fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="anim-toast pointer-events-auto px-4 py-2 min-w-[240px] max-w-[420px] flex items-center gap-2 font-bold text-sm uppercase tracking-[0.06em] border-2 cursor-pointer"
          style={{
            background: toneColor(t.tone),
            color: t.tone === "warn" ? "#0E0830" : "#FFFFFF",
            borderColor: "#0E0830",
            boxShadow: "0 4px 0 0 #0E0830, 0 12px 32px rgba(0,0,0,0.5)",
            fontFamily: "var(--font-display)",
            fontSize: "1.05rem",
          }}
          onClick={() => dismiss(t.id)}
          title="Click to dismiss"
        >
          <span className="text-base">{toneIcon(t.tone)}</span>
          <span className="truncate">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function toneColor(t: ToastTone): string {
  switch (t) {
    case "success": return "var(--ss-btn-stat)";
    case "warn":    return "var(--ss-accent)";
    case "error":   return "var(--ss-btn-exit)";
    default:        return "var(--ss-btn-info)";
  }
}

function toneIcon(t: ToastTone): string {
  switch (t) {
    case "success": return "✓";
    case "warn":    return "!";
    case "error":   return "✕";
    default:        return "▸";
  }
}
