import { handle, requireUser } from "@/lib/auth/session";
import { getPlayState } from "@/lib/game";

export async function GET() {
  return handle(async () => getPlayState(await requireUser()));
}
