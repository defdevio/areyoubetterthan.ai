import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/auth/session";
import { userSummary } from "@/lib/results";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const mode = req.nextUrl.searchParams.get("mode") === "all" ? "all" : "default";
    return userSummary(user.id, mode);
  });
}
