import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from "obscenity";
import { HttpError } from "@/lib/errors";

const profanity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
  whitelistedTerms: ["dickinson", "penistone"],
});

/**
 * A user-chosen public name: control characters stripped, whitespace collapsed, 1–40 chars,
 * and no profanity (leetspeak and lookalike characters included).
 */
export function cleanDisplayName(v: unknown): string {
  if (typeof v !== "string") throw new HttpError(400, "Display name is required.");
  const name = v.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name.length < 1) throw new HttpError(400, "Display name is required.");
  if (profanity.hasMatch(name) || profanity.hasMatch(name.replace(/[^\p{L}]/gu, "")))
    throw new HttpError(400, "That display name isn't allowed. Pick another.");
  return name;
}
