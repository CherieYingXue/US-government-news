import { after, connection } from "next/server";
import { getStatus } from "@/lib/queries";
import { isUpdateDue, startUpdate } from "@/lib/updater";

export const maxDuration = 300;

export async function GET() {
  await connection();
  try {
    // Hosts that freeze idle servers miss the 22:00 GMT timer; the next visit runs the overdue update.
    if (await isUpdateDue()) {
      const result = await startUpdate("catch-up");
      if (result.started) after(() => result.done);
    }
    return Response.json(await getStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/status]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Could not load update status." }, { status: 500 });
  }
}
