"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { hasSave } from "@/engine/saveEngine";

export default function StartScreen() {
  const [saveExists, setSaveExists] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hasSave().then((ok) => {
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSaveExists(ok);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-dvh w-full flex items-center justify-center px-4 py-10 relative overflow-hidden bg-[color:var(--ss-bg)]">
      <BackgroundPitch />

      <div className="relative w-full max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="panel overflow-hidden"
        >
          <div className="panel-bar text-base sm:text-lg">
            Gaffer FC · Football Management · Est. 2026
          </div>

          <div className="bg-[color:var(--ss-row-bench)] text-center px-8 py-10 sm:py-14">
            <h1 className="sr-only">Gaffer FC</h1>
            <div className="flex justify-center">
              <Image
                src="/LOGO_GAFFER.png"
                alt="Gaffer FC"
                width={520}
                height={260}
                priority
                className="w-full max-w-[320px] sm:max-w-[440px] h-auto crt select-none"
                draggable={false}
              />
            </div>
            <p className="mt-6 text-white/90 text-xs sm:text-sm uppercase tracking-[0.18em] font-bold leading-relaxed max-w-md mx-auto">
              Pick a club. Set tactics.<br />
              Climb the divisions. Win the cup.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
            <Link href="/career/new" className="btn btn-stat h-14 text-sm !rounded-none border-0 border-r-0 sm:border-r-2 border-b-2 sm:border-b-0 border-[color:var(--ss-bg-deep)]">
              ▶ New Career
            </Link>
            <Link
              href={saveExists ? "/dashboard" : "/career/new"}
              className={`btn h-14 text-sm !rounded-none border-0 ${saveExists ? "btn-info" : "btn-action opacity-50 pointer-events-none"}`}
              aria-disabled={!saveExists}
            >
              ⏵ Continue
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-0">
            <button disabled className="btn btn-action !rounded-none border-0 border-r-2 border-[color:var(--ss-bg-deep)] h-10 text-[10px] opacity-50 cursor-not-allowed">
              Custom DB · P3
            </button>
            <button disabled className="btn btn-action !rounded-none border-0 h-10 text-[10px] opacity-50 cursor-not-allowed">
              Friend League · Soon
            </button>
          </div>

          <div className="ss-strip text-center text-[10px] uppercase tracking-[0.22em] py-2.5 text-[color:var(--ss-cream)]">
            All clubs, players, badges, kits, stadiums and competitions are fictional.
          </div>
        </motion.div>

        <p className="text-center mt-3 text-[10px] uppercase tracking-[0.3em] text-white/70 scoreboard">
          v0.1 · MVP · Single-Player
        </p>
      </div>
    </div>
  );
}

function BackgroundPitch() {
  return (
    <div aria-hidden className="absolute inset-0 -z-0 opacity-35 pointer-events-none">
      <svg
        viewBox="0 0 1200 800"
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="bgg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1F8B33" />
            <stop offset="100%" stopColor="#0A1138" />
          </linearGradient>
          <pattern id="stripes" width="120" height="800" patternUnits="userSpaceOnUse">
            <rect width="60" height="800" fill="#166D26" opacity="0.4" />
          </pattern>
        </defs>
        <rect width="1200" height="800" fill="url(#bgg)" />
        <rect width="1200" height="800" fill="url(#stripes)" />
        <g stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="3" fill="none">
          <rect x="80" y="80" width="1040" height="640" />
          <line x1="600" y1="80" x2="600" y2="720" />
          <circle cx="600" cy="400" r="80" />
          <rect x="80" y="240" width="180" height="320" />
          <rect x="940" y="240" width="180" height="320" />
        </g>
      </svg>
    </div>
  );
}
