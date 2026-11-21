const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const num = (v: number | string | null | undefined) => (v == null || v === "" ? "—" : nf0.format(Number(v)));
export const num1 = (v: number | null | undefined) => (v == null ? "—" : nf1.format(v));
export const short = (v: number | string | null | undefined) => (v == null ? "—" : compact.format(Number(v)));
export const signed = (v: number | string | null | undefined, compactIt = false) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  const s = compactIt ? compact.format(Math.abs(n)) : nf0.format(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : "0";
};
export const pct = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf1.format(Math.abs(n))}%`;
};
export const dateLabel = (iso: string) =>
  new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
export const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return dateLabel(iso.slice(0, 10));
};
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
