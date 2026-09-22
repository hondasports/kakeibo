import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { getWeekSessionHandler } from "./queries";
import { getOrCreateCurrentWeekSessionHandler } from "./mutations";
import type { WeekSessionDoc } from "./testHelpers";
import { createIdentity, OTHER_USER_ID, GROUP_ID, OTHER_GROUP_ID, createMutationCtx, createQueryCtx, sampleSession, otherGroupSession } from "./testHelpers";

describe("getOrCreateCurrentWeekSession", () => {
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

describe("getWeekSession", () => {
  it("指定週のセッションが返される", async () => {
    const identity = createIdentity();
    const ctx = createQueryCtx(identity, { uniqueDoc: sampleSession });

    const result = await getWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual(sampleSession);
  });

  it("セッションが存在しない場合は null", async () => {
    const identity = createIdentity();
    const ctx = createQueryCtx(identity, { uniqueDoc: null });

    const result = await getWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toBeNull();
  });

  it("現在グループのセッションだけを返す（withIndex で groupId 絞り込み）", async () => {
    const identityOther = createIdentity({ tokenIdentifier: OTHER_USER_ID });
    const otherGroupMember = {
      _id: "member-other",
      _creationTime: 1000,
      groupId: OTHER_GROUP_ID as Id<"groups">,
      userId: identityOther.tokenIdentifier,
      role: "owner" as const,
    };
    const ctx = createQueryCtx(identityOther, {
      sessions: [sampleSession, otherGroupSession],
      groupMember: otherGroupMember,
    });

    const result = await getWeekSessionHandler(ctx, {
      weekStartDate: "2024-01-08",
    });

    expect(result).toEqual(otherGroupSession);
    expect(result).not.toEqual(expect.objectContaining({ groupId: GROUP_ID }));
  });

  it("未認証時: ConvexError が throw される", async () => {
    const ctx = createQueryCtx(null);

    await expect(
      getWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" }),
    ).rejects.toBeInstanceOf(ConvexError);

    await expect(getWeekSessionHandler(ctx, { weekStartDate: "2024-01-08" })).rejects.toMatchObject(
      { data: "Not authenticated" },
    );
  });
});
