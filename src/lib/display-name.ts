import { HttpError } from "@/lib/errors";

/** A user-chosen public name: control characters stripped, whitespace collapsed, 1–40 chars. */
export function cleanDisplayName(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "Display name is required.");
  const name = v.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name.length < 1) throw new HttpError(400, "Display name is required.");
  return name;
}
