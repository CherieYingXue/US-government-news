import { timingSafeEqual } from "node:crypto";
import { startUpdate } from "@/lib/updater";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** For an external scheduler (e.g. a platform cron at 0 22 * * *). Requires CRON_SECRET. */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await startUpdate("cron");
  if (!result.started) return Response.json({ started: false, reason: result.reason });
  await result.done;
  return Response.json({ started: true, runId: result.runId });
}
