# Gaffer FC — Football Management (MVP)

A retro-modern football management web game inspired by the feeling of
classic Sensible World of Soccer management, LMA Manager, and old-school PES
Master League — rebuilt for the browser.

> **Important: 100% fictional data.** No real clubs, no real players, no
> real badges, no real kits, no real stadiums, no official competition
> branding. Everything is invented for this game.

## Tech Stack

- **Next.js 16 / React 19** — App Router, Turbopack
- **TypeScript** strict
- **Tailwind v4** — design system in `src/app/globals.css`
- **Zustand** — global game state (`src/store/gameStore.ts`)
- **PixiJS 8** + **@pixi/react 8** — 2D pitch & drag-and-drop tactics board
- **Framer Motion** — UI transitions
- **localStorage** — MVP saves (IndexedDB-ready)

## Run

```bash
npm install
npm run dev
# http://localhost:3000
```

```bash
npm run build  # production build
npm run lint   # eslint
```

## Phase 1 MVP — Build Loop

1. **Start screen** → "New Career" or "Continue".
2. **Career setup** — pick division, choose 1 of 80 fictional clubs, name your manager.
3. **Dashboard** — next match, league position, board confidence, fan mood, hot player, objectives.
4. **Squad** — 25 players per club (2,000 total), filters, full attribute breakdowns.
5. **Tactics** — PixiJS pitch with drag-and-drop player tokens, formation switcher (4-4-2, 4-3-3, 3-5-2, 4-2-3-1, 5-3-2, 4-5-1), 8 tactics, captain, warnings.
6. **Match Day** — pre-match hints, Quick Sim or Watch Highlights.
7. **Match Result** — score, full timeline, xG, possession, shots, ratings, MOTM, mood/board deltas.
8. **League** — tables for all 4 divisions with promotion/relegation/qualification borders, full fixtures.
9. **Cups** — National Cup, League Cup (active rd 1), Champions Cup, Continental Cup, Super Shield (placeholders for continental).
10. **Inbox** — board messages, match reports.
11. **Save / Load** — automatic `localStorage` persistence.

## Fictional Database

| Tier | Division | Teams | Avg OVR Range | Budget Range |
|------|----------|-------|---------------|--------------|
| 1 | Premier Division | 20 | 72–84 | £20m – £120m |
| 2 | Division One | 20 | 64–76 | £4m – £25m |
| 3 | Division Two | 20 | 56–68 | £800k – £6m |
| 4 | Division Three | 20 | 45–60 | £50k – £1m |

- **80 clubs** seeded with original names, badges, kits, and stadiums.
- **2,000 players** procedurally generated from 18 nationality name pools.
- Every club includes a **Star**, a **Veteran Leader**, a **Fan Favourite**,
  an **Inconsistent Talent**, an **Injury-Prone**, a **Backup Keeper**, a
  **High-Potential Youth**, and a **Young Prospect**.
- 23 **player traits** (Wonderkid, Big Game Player, Cult Hero, Cup Specialist…),
  13 **personalities**, 20 **club personalities**, 10 **club play styles**.

## Match Engine

Probability-driven (70% logic / 30% chaos):

- Inputs: attack, midfield, defence, GK, lineup quality, form, morale, fitness,
  home advantage, tactic, weather, rivalry, cup chaos.
- Outputs: scoreline, xG, shots, possession, full event timeline, player
  ratings, MOTM, attendance, fan mood / board confidence deltas.
- 16 **hidden match stories** including *Cup Shock*, *Keeper Masterclass*,
  *Striker On Fire*, *Underdog Inspired*, *Favourite Complacent*.

## File Structure

```
src/
  types/game.ts            # All game types
  data/
    names.ts               # 18 fictional nationality name pools
    clubSeeds.ts           # 80 fictional club seeds
    competitionSeeds.ts    # League + cup definitions
    formations.ts          # 6 formations with normalised slot positions
  generators/
    playerGenerator.ts     # Per-club squad of 25 with archetype mix
    teamGenerator.ts       # Builds Club + ratings + budgets + facilities
    fixtureGenerator.ts    # Round-robin + cup round 1
  engine/
    matchEngine.ts         # Probability + story-driven match sim
    leagueEngine.ts        # Table, autoLineup, player progression
    saveEngine.ts          # localStorage save/load (IndexedDB-ready)
  store/gameStore.ts       # Zustand career/database, advance week
  components/
    game/AppShell.tsx      # Top nav, badge, season/week display
    game/Badge.tsx         # SVG badge renderer (no images by default)
    game/Kit.tsx           # SVG kit preview
    game/Placeholder.tsx   # Phase 2 stubs
    pixi/TacticsBoard.tsx  # PixiJS drag-and-drop pitch
  app/
    page.tsx               # Start screen
    career/new/page.tsx    # Choose division + club
    dashboard/page.tsx     # Office
    squad/page.tsx         # Squad with filters + detail modal
    tactics/page.tsx       # Pixi pitch + formations + tactics + warnings
    match/page.tsx         # Match Day pre-match + watch highlights
    match/result/page.tsx  # Result + stats + ratings
    league/page.tsx        # Tables + fixtures
    cups/page.tsx          # Domestic + continental cup overview
    inbox/page.tsx         # Inbox
    transfers/             # Phase 2 placeholder
    training/              # Phase 2 placeholder
    club/                  # Phase 2 placeholder
```

## Custom Badge Uploads (Phase 3)

Badges are SVG-rendered by default — no image assets are shipped. The
`Badge` component supports a future `customImageDataUrl` per badge for
user-uploaded images (max 1MB, PNG/JPG). Disclaimer to be enforced at
upload time:

> Only upload images you own or have permission to use.

## What's Next

Out-of-scope for this MVP and ready as types / placeholder screens:

- Transfers (board, bids, deadline day, rival hijacks)
- Training (weekly focuses)
- Club Upgrades (stadium, training ground, youth, scouting, commercial)
- Custom database import/export (JSON)
- Multiplayer / friend leagues (Supabase auth, cloud saves, badge uploads)
- Continental cup full bracket auto-population from qualification

## Deploying to Vercel

The repository ships with a minimal `vercel.json` that pins the framework
preset, so `vercel --prod` and the Git-import flow both work out of the box.

1. Sign in to [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project → Import Git Repository** and pick `GAFFER-FC`.
3. Vercel auto-detects the framework as **Next.js**. Leave every setting
   on its default (root directory blank, build command `next build`,
   output directory blank).
4. Hit **Deploy**. The first build runs `npm install` then `next build`
   and takes ~90 seconds.

Vercel will assign a URL like `gaffer-fc-<your-username>.vercel.app`. The
short `gaffer-fc.vercel.app` slug is global and may already be taken by
someone else — always use the URL Vercel shows in the dashboard.

**If the build fails**, click into the deployment for the build log.
Common causes:

- A pre-existing project on Vercel with the wrong **Root Directory**
  (set it back to the repo root).
- An older Node version pinned in **Project Settings → General**.
  Next.js 16 needs Node 20+.

## Disclaimer

All clubs, players, badges, kits, stadiums, and competitions are fictional.
Any resemblance to real-world football entities is coincidental.
