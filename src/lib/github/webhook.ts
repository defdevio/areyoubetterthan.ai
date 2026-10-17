import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifies GitHub's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body). */
export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
