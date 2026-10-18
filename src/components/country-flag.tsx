import "flag-icons/css/flag-icons.min.css";
import { countryName } from "@/lib/countries";
import { cx } from "@/components/ui";

/** The country's SVG flag at text size. Renders nothing when no country is set. */
export function CountryFlag({ code, className }: { code: string | null; className?: string }) {
  if (!code) return null;
  const name = countryName(code);
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cx("fi shrink-0 rounded-[2px] align-middle ring-1 ring-white/10", `fi-${code.toLowerCase()}`, className)}
    />
  );
}
