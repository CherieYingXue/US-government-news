import { nextScheduledRun } from "./schedule";
import { isUpdateDue, startUpdate } from "./updater";

const g = globalThis as typeof globalThis & { __trackerScheduler?: boolean };

async function runIfStarted(trigger: "scheduled" | "catch-up") {
  try {
    const result = await startUpdate(trigger);
    if (result.started) await result.done;
  } catch (error) {
    console.error(`[scheduler] ${trigger} update failed:`, error instanceof Error ? error.message : error);
  }
}

function armNext() {
  const delay = Math.max(1000, nextScheduledRun().getTime() - Date.now());
  const timer = setTimeout(async () => {
    await runIfStarted("scheduled");
    armNext();
  }, Math.min(delay, 2 ** 31 - 1));
  timer.unref?.();
}

/** Long-running servers update at 22:00 GMT on their own; serverless hosts rely on the catch-up and cron paths. */
export function startScheduler() {
  if (g.__trackerScheduler) return;
  g.__trackerScheduler = true;
  armNext();
  const startup = setTimeout(async () => {
    try {
      if (await isUpdateDue()) await runIfStarted("catch-up");
    } catch (error) {
      console.error("[scheduler] startup check failed:", error instanceof Error ? error.message : error);
    }
  }, 5000);
  startup.unref?.();
}
