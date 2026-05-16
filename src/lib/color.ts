/**
 * Tiny colour helpers — convert hex strings, mix, and pick a readable
 * foreground colour for any given background.
 */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const v = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const num = parseInt(v, 16);
  if (Number.isNaN(num)) return [128, 128, 128];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Returns either white or near-black (#0E0830) depending on which gives
 * the better contrast against `bg`. Use whenever you place text over a
 * dynamic team colour.
 */
export function readableOn(bg: string): string {
  return relativeLuminance(bg) > 0.55 ? "#0E0830" : "#FFFFFF";
}

/**
 * Darken a hex by a 0..1 ratio (0 = same, 1 = black).
 */
export function darken(hex: string, ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const k = Math.max(0, Math.min(1, 1 - ratio));
  return rgbToHex(r * k, g * k, b * k);
}
