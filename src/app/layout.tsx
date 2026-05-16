import type { Metadata } from "next";
import { Press_Start_2P, VT323, Jersey_15, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/game/Toaster";
import { UiSoundLayer } from "@/components/game/UiSoundLayer";

// Chunky 8x8 pixel font — reserved for the GAFFER FC logo accent only.
const pressStart = Press_Start_2P({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: "400",
});

// Skinny pixel font — used for scoreboards, stats and dense numeric displays.
const vt323 = VT323({
  variable: "--font-bitmap",
  subsets: ["latin"],
  weight: "400",
});

// Jersey 15 — bold sporty pixel font designed for sports kits and team
// numbers. Blocky and characterful, but engineered for legibility (what we
// want for headlines, panel bars, tabs and chunky labels).
const jersey = Jersey_15({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

// Inter — clean, modern, max-readable sans for paragraphs, list rows,
// player names, and any dense body text.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Gaffer FC — Football Management",
  description:
    "A retro-modern football management web game inspired by Sensible Soccer, LMA Manager and old PES Master League. Build your club, set your tactics, climb the divisions, win the cup.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${pressStart.variable} ${vt323.variable} ${jersey.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <UiSoundLayer />
      </body>
    </html>
  );
}
