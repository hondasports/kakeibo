/**
 * weekSessions のユースケース。
 * group 認可は presentation 層で済んでいる前提で groupId を受け取る。
 */
import { calculateWeekEndDate } from "../../domain/week/weekDates";
import {
  assertRetrieved,
  buildNewWeekSessionFields,
  buildResetPatch,
} from "../../domain/weekSessions/rules";
import type { WeekSessionRecord, WeekSessionStore } from "../../domain/weekSessions/store";

export async function getOrCreateWeekSession(
  store: WeekSessionStore,
  groupId: string,
  weekStartDate: string,
  now: () => number,
): Promise<WeekSessionRecord> {
  const weekEndDate = calculateWeekEndDate(weekStartDate);

  const existing = await store.findByGroupAndWeekStart(groupId, weekStartDate);
  if (existing !== null) {
    return existing;
  }

  const sessionId = await store.insert(
    buildNewWeekSessionFields({ groupId, weekStartDate, weekEndDate, now: now() }),
  );
  return assertRetrieved(await store.get(sessionId), "created");
}

export async function resetWeekSession(
  store: WeekSessionStore,
  groupId: string,
  weekStartDate: string,
  now: () => number,
): Promise<{ reset: boolean }> {
  const session = await store.findByGroupAndWeekStart(groupId, weekStartDate);
  if (session === null) {
    return { reset: false };
  }

  await store.patch(session.id, buildResetPatch(now()));
  return { reset: true };
}
