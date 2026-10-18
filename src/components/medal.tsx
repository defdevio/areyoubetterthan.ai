import { cx } from "@/components/ui";

const MEDALS = [
  { label: "Gold", fill: "#E8B923", rim: "#9A7408" },
  { label: "Silver", fill: "#C9CED6", rim: "#6B7280" },
  { label: "Bronze", fill: "#CD7F32", rim: "#7A4312" },
] as const;

/** Gold, silver, or bronze medal for places 1–3. */
export function Medal({ place, className }: { place: 1 | 2 | 3; className?: string }) {
  const m = MEDALS[place - 1];
  return (
    <svg
      role="img"
      aria-label={`${m.label} medal`}
      viewBox="0 0 24 24"
      className={cx("inline-block size-5 shrink-0", className)}
    >
      <path d="M5 1h4.5l-1.5 8.5L5.5 9.5z" className="fill-ai" />
      <path d="M14.5 1H19l-2.5 8.5-2.5 1.5z" className="fill-ai" />
      <circle cx="12" cy="15.5" r="7.5" fill={m.fill} stroke={m.rim} strokeWidth="1.5" />
      <circle cx="12" cy="15.5" r="4.25" fill="none" stroke={m.rim} strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}
