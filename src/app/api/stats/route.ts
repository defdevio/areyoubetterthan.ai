import { getHumanStats } from "@/lib/public-stats";

export async function GET() {
  return Response.json(await getHumanStats());
}
