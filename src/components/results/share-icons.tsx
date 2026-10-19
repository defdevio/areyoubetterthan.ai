import { siBluesky, siFacebook, siInstagram, siReddit, siThreads, siWhatsapp, siX } from "simple-icons";

// Official marks in their brand colors. X and Threads are black on their own sites, so they use the text color on the dark UI.
const BRAND: Record<string, { path: string; fill: string }> = {
  x: { path: siX.path, fill: "currentColor" },
  reddit: { path: siReddit.path, fill: `#${siReddit.hex}` },
  facebook: { path: siFacebook.path, fill: `#${siFacebook.hex}` },
  threads: { path: siThreads.path, fill: "currentColor" },
  bluesky: { path: siBluesky.path, fill: `#${siBluesky.hex}` },
  whatsapp: { path: siWhatsapp.path, fill: `#${siWhatsapp.hex}` },
  instagram: { path: siInstagram.path, fill: `#${siInstagram.hex}` },
};

export function ShareIcon({ id }: { id: string }) {
  if (id === "linkedin") {
    // Official LinkedIn "in" bug, from LinkedIn's brand downloads. simple-icons no longer ships LinkedIn.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/linkedin-in-bug.png" alt="" className="size-5 shrink-0 object-contain" />;
  }
  if (id === "email") {
    return (
      <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    );
  }
  const brand = BRAND[id];
  if (!brand) return null;
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      <path d={brand.path} fill={brand.fill} />
    </svg>
  );
}
