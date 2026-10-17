import { handle, requireUser } from "@/lib/auth/session";
import { PENDING_PHASES, userResults } from "@/lib/results";

export const maxDuration = 60;

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const items = await userResults(user.id);
    return { items, pending: items.filter((i) => PENDING_PHASES.includes(i.phase)).length };
  });
}
