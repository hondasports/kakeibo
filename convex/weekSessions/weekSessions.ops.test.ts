import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { resetWeekSessionForUserHandler } from "./internal";
import { getOrCreateWeekSessionHandler } from "./mutations";
import type { WeekSessionDoc } from "./testHelpers";
import { createIdentity, createMutationCtx, GROUP_ID, sampleSession } from "./testHelpers";

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
