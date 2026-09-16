/**
 * weekSessions の純粋なドメインルール。
 * Convex の ctx や Doc 型に依存しない。
 */
import type { NewWeekSessionFields, WeekSessionPatch, WeekSessionRecord } from "./store";

/**
 * endpoint 契約上期待されるドメインエラー。
 * presentation 層はこの型のみ ConvexError へ変換する。
 */
export class WeekSessionDomainError extends Error {}

/** 実行環境のローカル時刻で YYYY-MM-DD を生成する。 */
export function formatLocalDate(timestamp: number): string {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildNewWeekSessionFields(args: {
  groupId: string;
  weekStartDate: string;
  weekEndDate: string;
  now: number;
}): NewWeekSessionFields {
  return {
    groupId: args.groupId,
    weekStartDate: args.weekStartDate,
    weekEndDate: args.weekEndDate,
    status: "draft",
    createdAt: args.now,
    updatedAt: args.now,
  };
}

/** complete 用 patch。reviewMemo は指定時のみキーを含める。 */
export function buildCompletePatch(reviewMemo: string | undefined, now: number): WeekSessionPatch {
  const patch: WeekSessionPatch = { status: "completed", updatedAt: now };
  if (reviewMemo !== undefined) {
    patch.reviewMemo = reviewMemo;
  }
  return patch;
}

/** reset 用 patch。reviewMemo は undefined を明示してクリアする。 */
export function buildResetPatch(now: number): WeekSessionPatch {
  return { status: "draft", reviewMemo: undefined, updatedAt: now };
}

export function assertWeekSessionFound(session: WeekSessionRecord | null): WeekSessionRecord {
  if (session === null) {
    throw new WeekSessionDomainError("Week session not found");
  }
  return session;
}

export function assertRetrieved(
  session: WeekSessionRecord | null,
  kind: "created" | "updated",
): WeekSessionRecord {
  if (session === null) {
    throw new WeekSessionDomainError(`Failed to retrieve ${kind} week session`);
  }
  return session;
}
