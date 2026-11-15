import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { getOrCreateCurrentWeekSessionHandler } from "./mutations";
import type { WeekSessionDoc } from "./testHelpers";
import { createIdentity, createMutationCtx, GROUP_ID, sampleSession } from "./testHelpers";

describe("getOrCreateCurrentWeekSession", () => {
  it.each([
    ["2026-10-18T14:59:59Z", "2026-10-12", "2026-10-18"],
    ["2026-10-18T15:00:00Z", "2026-10-19", "2026-10-25"],
    ["2023-12-31T15:00:00Z", "2024-01-01", "2024-01-07"],
  ])("JST の固定時刻 %s で現在週のセッションを作る", async (instant, start, end) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    try {
      const ctx = createMutationCtx(createIdentity(), {
        uniqueDoc: null,
        insertedDoc: sampleSession,
      });
      await getOrCreateCurrentWeekSessionHandler(ctx);
      expect(ctx.db.insert).toHaveBeenCalledWith(
        "weekSessions",
        expect.objectContaining({ weekStartDate: start, weekEndDate: end }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("新規セッションが draft 状態で作成される", async () => {
    const identity = createIdentity();
    const createdSession: WeekSessionDoc = {
      ...sampleSession,
      _id: "new-session-id",
    };

    // uniqueDoc: null → 既存セッションなし → 新規作成
    const ctx = createMutationCtx(identity, {
      uniqueDoc: null,
      insertedDoc: createdSession,
    });

    const result = await getOrCreateCurrentWeekSessionHandler(ctx);

    expect(result).toEqual(createdSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbInsert).toHaveBeenCalledWith(
      "weekSessions",
      expect.objectContaining({
        groupId: GROUP_ID,
        status: "draft",
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("既存セッションがある場合は新規作成せずそのまま返す（冪等性）", async () => {
    const identity = createIdentity();

    // uniqueDoc: sampleSession → 既存セッションあり → 新規作成しない
    const ctx = createMutationCtx(identity, {
      uniqueDoc: sampleSession,
    });

    const result = await getOrCreateCurrentWeekSessionHandler(ctx);

    expect(result).toEqual(sampleSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(getOrCreateCurrentWeekSessionHandler(ctx)).rejects.toBeInstanceOf(ConvexError);

    await expect(getOrCreateCurrentWeekSessionHandler(ctx)).rejects.toMatchObject({
      data: "Not authenticated",
    });
  });
});
