"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

/** GitHub avatar, or the name's initial for people listed under a display name or when the image fails. */
export function HumanAvatar({ name, url, size = "size-7" }: { name: string; url: string | null; size?: string }) {
  if (url) return <AvatarImage key={url} name={name} url={url} size={size} />;
  return <Initial name={name} size={size} />;
}

function AvatarImage({ name, url, size }: { name: string; url: string; size: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // An image that errors before hydration never fires onError, so check it once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return <Initial name={name} size={size} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className={cx(size, "shrink-0 rounded-full bg-white/5")}
    />
  );
}

function Initial({ name, size }: { name: string; size: string }) {
  return (
    <span className={cx(size, "grid shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-muted")}>
      {name.match(/\p{L}|\p{N}/u)?.[0].toUpperCase() ?? "?"}
    </span>
  );
}
