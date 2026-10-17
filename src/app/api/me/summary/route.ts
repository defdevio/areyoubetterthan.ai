import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/auth/session";
import { parseMode } from "@/lib/models";
import { userSummary } from "@/lib/results";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const mode = parseMode(req.nextUrl.searchParams.get("mode"));
    return userSummary(user.id, mode);
  });
}
