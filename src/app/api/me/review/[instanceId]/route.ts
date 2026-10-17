import { handle, requireUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";
import { attemptReview } from "@/lib/results";

export async function GET(_req: Request, ctx: RouteContext<"/api/me/review/[instanceId]">) {
  return handle(async () => {
    const user = await requireUser();
    const { instanceId } = await ctx.params;
    const review = await attemptReview(user.id, instanceId);
    if (!review) throw new HttpError(404, "You haven't attempted this task.");
    return review;
  });
}
