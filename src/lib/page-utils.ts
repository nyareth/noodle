export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
export const toInt = (v: string | string[] | undefined, fallback: number) => {
  const n = Number.parseInt(first(v) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** Calm gradient per subject for the card banner (Moodle shows a generated pattern). */
export function bannerStyle(seed: string): React.CSSProperties {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 42% 36%), hsl(${(h + 35) % 360} 48% 52%))` };
}
