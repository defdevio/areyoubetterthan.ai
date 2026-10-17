import { config } from "@/lib/config";
import { getDb } from "@/lib/db";
import { webhookDeliveries } from "@/lib/db/schema";
import { verifySignature } from "@/lib/github/webhook";
import { handleWorkflowRunEvent } from "@/lib/scoring/service";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.text();
  const secret = config.github.webhookSecret;
  if (!secret || !verifySignature(secret, body, req.headers.get("x-hub-signature-256"))) {
    return Response.json({ error: "bad signature" }, { status: 401 });
  }
  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery");
  if (event === "ping") return Response.json({ ok: true });
  if (event !== "workflow_run") return Response.json({ ignored: event });

  const payload = JSON.parse(body);
  // Intermediate states are only interesting for the "running" indicator; dedupe all of them.
  if (delivery) {
    const db = await getDb();
    const inserted = await db
      .insert(webhookDeliveries)
      .values({ id: delivery, event: `${event}.${payload.action ?? ""}` })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return Response.json({ duplicate: true });
  }
  try {
    const result = await handleWorkflowRunEvent(payload);
    return Response.json({ result });
  } catch (err) {
    console.error("[webhook] workflow_run failed", err);
    // 500 lets GitHub show the failure; the poll-based reconcile will catch up regardless.
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
