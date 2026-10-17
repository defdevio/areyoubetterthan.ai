import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { webhookDeliveries } from "@/lib/db/schema";
import { backfillMetrics } from "@/lib/attempt-metrics";
import { finalizeExpiredAttempts } from "@/lib/game";
import { reconcile } from "@/lib/scoring/service";

export const maxDuration = 60;

/** Daily safety net (Vercel cron): finish abandoned attempts and unstick scoring. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const expired = await finalizeExpiredAttempts();
  await reconcile();
  // Delivery ids only need to outlive GitHub's redelivery window.
  const db = await getDb();
  await db.delete(webhookDeliveries).where(lt(webhookDeliveries.receivedAt, new Date(Date.now() - 14 * 86_400_000)));
  const backfilled = await backfillMetrics();
  return Response.json({ ok: true, expired, backfilled });
}
