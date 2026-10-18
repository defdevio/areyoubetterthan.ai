import { cx } from "@/components/ui";

/** GitHub avatar, or the name's initial for people listed under a display name. */
export function HumanAvatar({ name, url, size = "size-7" }: { name: string; url: string | null; size?: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cx(size, "shrink-0 rounded-full bg-white/5")} />;
  }
  return (
    <span className={cx(size, "grid shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-muted")}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
