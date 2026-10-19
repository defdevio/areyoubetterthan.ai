/** Share-sheet links for the public results page. Instagram has no web share URL, so it goes through the native share sheet. */
export type ShareTarget = { id: string; label: string; href: string };

export function shareTargets({ url, message }: { url: string; message: string }): ShareTarget[] {
  const text = `${message} ${url}`;
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString();
  return [
    { id: "x", label: "X", href: `https://x.com/intent/post?${q({ text: message, url })}` },
    { id: "reddit", label: "Reddit", href: `https://www.reddit.com/submit?${q({ url, title: message })}` },
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?${q({ u: url })}` },
    { id: "linkedin", label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?${q({ url })}` },
    { id: "threads", label: "Threads", href: `https://www.threads.net/intent/post?${q({ text })}` },
    { id: "bluesky", label: "Bluesky", href: `https://bsky.app/intent/compose?${q({ text })}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?${q({ text })}` },
    { id: "email", label: "Email", href: `mailto:?${q({ subject: message, body: text })}` },
  ];
}

/** The n models whose rate is closest to the human's, strongest first, so the share image compares like with like. */
export function closestModels<T extends { rate: { p: number | null } }>(models: T[], humanP: number | null, n: number): T[] {
  if (humanP === null) return models.slice(0, n);
  return models
    .map((m) => ({ m, distance: Math.abs((m.rate.p ?? 0) - humanP) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n)
    .sort((a, b) => (b.m.rate.p ?? 0) - (a.m.rate.p ?? 0))
    .map((x) => x.m);
}
