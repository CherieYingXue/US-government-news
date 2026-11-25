export const UPDATE_HOUR_UTC = 22;
export const SCHEDULE_LABEL = "Every day at 22:00 GMT";

export function nextScheduledRun(now = new Date()): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), UPDATE_HOUR_UTC));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function lastScheduledRun(now = new Date()): Date {
  const next = nextScheduledRun(now);
  return new Date(next.getTime() - 24 * 60 * 60 * 1000);
}
