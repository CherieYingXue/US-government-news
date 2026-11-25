import { after } from "next/server";
import { startUpdate } from "@/lib/updater";

export const maxDuration = 300;

function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request) || request.headers.get("x-requested-with") !== "tracker") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const result = await startUpdate("manual");
    if (!result.started) {
      const message =
        result.reason === "running"
          ? "An update is already in progress."
          : "An update just ran. Please wait a minute before updating again.";
      return Response.json({ started: false, reason: result.reason, message }, { status: result.reason === "running" ? 409 : 429 });
    }
    after(() => result.done);
    return Response.json({ started: true, runId: result.runId }, { status: 202 });
  } catch (error) {
    console.error("[api/update]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not start the update." }, { status: 500 });
  }
}
