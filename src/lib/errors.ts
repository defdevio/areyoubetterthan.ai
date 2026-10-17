import { unstable_rethrow } from "next/navigation";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Wraps a route handler body: maps HttpError to JSON responses. */
export async function handle<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return Response.json(result);
  } catch (err) {
    // Let Next.js handle its own control-flow signals (prerender bailouts, redirects).
    unstable_rethrow(err);
    if (err instanceof HttpError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: "Something went wrong on our side." }, { status: 500 });
  }
}

/** Defense in depth on top of SameSite=Lax cookies: reject cross-site writes. */
export function assertSameOrigin(req: Request, appUrl: string) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = new Set([new URL(appUrl).origin, new URL(req.url).origin]);
  if (!allowed.has(origin)) throw new HttpError(403, "Cross-site request rejected.", "bad_origin");
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 512 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large.", "too_large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON.", "bad_request");
  }
}
