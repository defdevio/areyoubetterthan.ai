import type { SourceBundle } from "@/lib/bundle-types";

const cache = new Map<string, Promise<SourceBundle>>();

export type Progress = { loaded: number; total: number | null };

async function download(url: string, onProgress?: (p: Progress) => void): Promise<SourceBundle> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Could not download the repository (${res.status}).`);
  const total = Number(res.headers.get("content-length")) || null;
  // Some hosts transparently decode gzip; detect by sniffing the magic bytes.
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  let text: string;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  const bundle = JSON.parse(text) as SourceBundle;
  if (!bundle.files || typeof bundle.files !== "object") throw new Error("Malformed repository bundle.");
  return bundle;
}

/** Downloads (once per page load) and unpacks a task's source bundle. */
export function loadBundle(url: string, onProgress?: (p: Progress) => void): Promise<SourceBundle> {
  let p = cache.get(url);
  if (!p) {
    p = download(url, onProgress).catch((err) => {
      cache.delete(url);
      throw err;
    });
    cache.set(url, p);
  }
  return p;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
