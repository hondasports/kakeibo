import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  getOrCreateWeekSessionHandler,
  updateReviewMemoHandler,
  completeWeekSessionHandler,
} from "./mutations";
import { resetWeekSessionForUserHandler } from "./internal";
import type { WeekSessionDoc } from "./testHelpers";
import { createIdentity, GROUP_ID, createMutationCtx, sampleSession } from "./testHelpers";

describe("updateReviewMemo", () => {
  it("振り返りメモが保存される", async () => {
    const identity = createIdentity();
    const updatedSession: WeekSessionDoc = {
      ...sampleSession,
      reviewMemo: "食費が多めだったので来週は作り置きを増やす",
      updatedAt: 9999,
    };

    const ctx = createMutationCtx(identity, {
      uniqueDoc: sampleSession,
      getDocById: {
        "session-001": sampleSession,
      },
      updatedDoc: updatedSession,
    });

    const result = await updateReviewMemoHandler(ctx, {
      weekStartDate: "2024-01-08",
      reviewMemo: "食費が多めだったので来週は作り置きを増やす",
    });

    expect(result).toEqual(updatedSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledOnce();
    expect(dbPatch).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        reviewMemo: "食費が多めだったので来週は作り置きを増やす",
        updatedAt: expect.any(Number),
      }),
    );
    expect(dbPatch).not.toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        status: expect.any(String),
      }),
    );
  });

  it("完了済みセッションでも status を維持したまま振り返りメモを再編集できる", async () => {
    const identity = createIdentity();
    const completedSession: WeekSessionDoc = {
      ...sampleSession,
      status: "completed",
      reviewMemo: "更新前メモ",
    };
    const updatedSession: WeekSessionDoc = {
      ...completedSession,
      reviewMemo: "更新後メモ",
      updatedAt: 9999,
    };

    const ctx = createMutationCtx(identity, {
      uniqueDoc: completedSession,
      getDocById: {
        "session-001": completedSession,
      },
      updatedDoc: updatedSession,
    });

    const result = await updateReviewMemoHandler(ctx, {
      weekStartDate: "2024-01-08",
      reviewMemo: "更新後メモ",
    });

    expect(result).toEqual(updatedSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        reviewMemo: "更新後メモ",
        updatedAt: expect.any(Number),
      }),
    );
    expect(result.status).toBe("completed");
  });

  it("セッションが存在しない場合は ConvexError", async () => {
    const identity = createIdentity();
    const ctx = createMutationCtx(identity, {
      uniqueDoc: null,
    });

    await expect(
      updateReviewMemoHandler(ctx, {
        weekStartDate: "2024-01-08",
        reviewMemo: "メモ",
      }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      updateReviewMemoHandler(ctx, {
        weekStartDate: "2024-01-08",
        reviewMemo: "メモ",
      }),
    ).rejects.toMatchObject({ data: expect.any(String) });
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      updateReviewMemoHandler(ctx, { weekStartDate: "2024-01-08", reviewMemo: "メモ" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      updateReviewMemoHandler(ctx, { weekStartDate: "2024-01-08", reviewMemo: "メモ" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});

describe("completeWeekSession", () => {
  it("draft セッションを completed に変更できる", async () => {
    const identity = createIdentity();
    const completedSession: WeekSessionDoc = {
      ...sampleSession,
      status: "completed",
      reviewMemo: "今週のまとめ",
      updatedAt: 9999,
    };

    const ctx = createMutationCtx(identity, {
      uniqueDoc: sampleSession,
      getDocById: {
        "session-001": sampleSession,
      },
      updatedDoc: completedSession,
    });

    const result = await completeWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-08",
      reviewMemo: "今週のまとめ",
    });

    expect(result).toEqual(completedSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        status: "completed",
        reviewMemo: "今週のまとめ",
        updatedAt: expect.any(Number),
      }),
    );
  });

  it("セッションが存在しない場合は ConvexError", async () => {
    const identity = createIdentity();
    const ctx = createMutationCtx(identity, { uniqueDoc: null });

    await expect(
      completeWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      completeWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(
      completeWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toMatchObject({ data: "Not authenticated" });
  });
});

describe("getOrCreateWeekSession", () => {
  it("指定週のセッションが存在しない場合は新規作成する", async () => {
    const identity = createIdentity();
    const createdSession: WeekSessionDoc = {
      ...sampleSession,
      _id: "new-session-id",
      weekStartDate: "2024-01-15",
      weekEndDate: "2024-01-21",
    };

    const ctx = createMutationCtx(identity, {
      uniqueDoc: null,
      insertedDoc: createdSession,
    });

    const result = await getOrCreateWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-15",
    });

    expect(result).toEqual(createdSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).toHaveBeenCalledWith(
      "weekSessions",
      expect.objectContaining({
        groupId: GROUP_ID,
        weekStartDate: "2024-01-15",
        status: "draft",
      }),
    );
  });

  it("指定週のセッションが存在する場合はそのまま返す", async () => {
    const identity = createIdentity();
    const ctx = createMutationCtx(identity, {
      uniqueDoc: sampleSession,
    });

    const result = await getOrCreateWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual(sampleSession);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbInsert = (ctx.db as any).insert as ReturnType<typeof vi.fn>;
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createMutationCtx(null);

    await expect(
      getOrCreateWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);
  });
});

describe("resetWeekSessionForUser", () => {
  it("status を draft に戻し、reviewMemo を削除する", async () => {
    const identity = createIdentity();
    const ctx = createMutationCtx(identity, {
      uniqueDoc: {
        ...sampleSession,
        status: "completed",
        reviewMemo: "今週のまとめ",
      },
    });

    await resetWeekSessionForUserHandler(ctx, {
      groupId: GROUP_ID as Id<"groups">,
      weekStartDate: "2024-01-08",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbPatch = (ctx.db as any).patch as ReturnType<typeof vi.fn>;
    expect(dbPatch).toHaveBeenCalledWith(
      "session-001",
      expect.objectContaining({
        status: "draft",
        reviewMemo: undefined,
      }),
    );
  });
});
