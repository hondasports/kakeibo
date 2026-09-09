import type { ActionCtx } from "../_generated/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { e2eCleanupHandler } from "./e2eCleanup";
import {
  e2eSeedAiExpenseDraftHandler,
  e2eSeedUnallocatedTaxDraftHandler,
  e2eSeedMixedTaxReviewDraftHandler,
  e2eSeedPendingGroupInvitationHandler,
  e2eSeedTaxReviewDraftHandler,
  e2eSeedTaxSummaryConflictDraftHandler,
} from "./e2eSeedDraft";
import {
  cleanupSystemAdminMembershipHandler,
  seedSystemAdminMembershipHandler,
} from "./e2eSystemAdminMembership";
import {
  cleanupSystemAdminSearchHandler,
  seedSystemAdminSearchHandler,
} from "./e2eSystemAdminSearch";

const E2E_USER_ID = "clerk|user_e2e";
const E2E_SECRET = "test-secret";
const GROUP_ID = "group-e2e";

const originalEnvironment = {
  appEnv: process.env.APP_ENV,
  secret: process.env.E2E_CLEANUP_SECRET,
  userId: process.env.E2E_CLERK_USER_ID,
};

afterEach(() => {
  if (originalEnvironment.appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalEnvironment.appEnv;
  if (originalEnvironment.secret === undefined) delete process.env.E2E_CLEANUP_SECRET;
  else process.env.E2E_CLEANUP_SECRET = originalEnvironment.secret;
  if (originalEnvironment.userId === undefined) delete process.env.E2E_CLERK_USER_ID;
  else process.env.E2E_CLERK_USER_ID = originalEnvironment.userId;
});

function configureEnvironment() {
  process.env.APP_ENV = "development";
  process.env.E2E_CLEANUP_SECRET = E2E_SECRET;
  process.env.E2E_CLERK_USER_ID = E2E_USER_ID;
}

function request(body: unknown, secret = E2E_SECRET) {
  return new Request("https://example.test/e2e", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": secret },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string, secret = E2E_SECRET) {
  return new Request("https://example.test/e2e", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-E2E-Cleanup-Secret": secret },
    body,
  });
}

function createActionCtx({
  runQuery = vi.fn().mockResolvedValue(GROUP_ID),
  runMutation = vi.fn().mockResolvedValue("fixture-id"),
}: {
  runQuery?: ReturnType<typeof vi.fn>;
  runMutation?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    runQuery,
    runMutation,
  } as unknown as ActionCtx;
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("e2eCleanupHandler", () => {
  beforeEach(configureEnvironment);

  it("secretが不正なら処理せず401を返す", async () => {
    const response = await e2eCleanupHandler(createActionCtx(), request({}, "wrong-secret"));

    expect(response.status).toBe(401);
  });

  it.each([
    ["userId", { userId: 1 }],
    ["email", { email: 1 }],
    ["groupId", { groupId: 1 }],
    ["weekStartDate", { weekStartDate: 1 }],
    ["resetWeekSession", { resetWeekSession: "yes" }],
    ["deleteE2eCategories", { deleteE2eCategories: "yes" }],
    ["setGroupMemberRole", { setGroupMemberRole: "admin" }],
    ["seedGroupMember", { seedGroupMember: { displayName: 1, email: "a@example.test" } }],
  ])("不正な%sを拒否する", async (_field, body) => {
    const response = await e2eCleanupHandler(createActionCtx(), request(body));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toMatchObject({
      error: expect.stringContaining("Invalid"),
    });
  });

  it("userIdもemailもない場合は400を返す", async () => {
    const response = await e2eCleanupHandler(createActionCtx(), request({}));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({
      error: "userId or email is required.",
    });
  });

  it("固定E2Eユーザー以外は403を返す", async () => {
    const response = await e2eCleanupHandler(createActionCtx(), request({ userId: "clerk|other" }));

    expect(response.status).toBe(403);
  });

  it("固定E2Eユーザーを主体にしたseedユーザーの所属だけを削除できる", async () => {
    const runQuery = vi.fn().mockResolvedValue(GROUP_ID);
    const runMutation = vi.fn().mockResolvedValue({ deletedCount: 1 });
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery, runMutation }),
      request({
        userId: E2E_USER_ID,
        seededUserId: "e2e-seed|group-member-test",
        clearGroupMemberships: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(runQuery).toHaveBeenCalledTimes(3);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it("UIですでに所属解除されたseedユーザーの後処理を冪等に完了できる", async () => {
    const runQuery = vi
      .fn()
      .mockResolvedValueOnce(GROUP_ID)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const runMutation = vi.fn().mockResolvedValue({ deletedCount: 0 });
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery, runMutation }),
      request({
        userId: E2E_USER_ID,
        seededUserId: "e2e-seed|group-member-removed",
        clearGroupMemberships: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "別グループのseedユーザー",
      runQuery: vi.fn().mockResolvedValueOnce(GROUP_ID).mockResolvedValueOnce("group-other"),
    },
    {
      name: "所属削除以外の操作を含むseedユーザー",
      runQuery: vi.fn().mockResolvedValue(GROUP_ID),
      body: { clearGroupInvitations: true },
    },
  ])("seedユーザーの安全範囲外の操作（$name）は403を返す", async ({ runQuery, body }) => {
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery }),
      request({
        userId: E2E_USER_ID,
        seededUserId: "e2e-seed|group-member-test",
        clearGroupMemberships: true,
        ...body,
      }),
    );

    expect(response.status).toBe(403);
  });

  it("指定グループが固定グループと異なる場合は403を返す", async () => {
    const runQuery = vi.fn().mockResolvedValueOnce(GROUP_ID).mockResolvedValueOnce("group-other");
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery }),
      request({ userId: E2E_USER_ID, groupId: "group-requested" }),
    );

    expect(response.status).toBe(403);
  });

  it("emailからユーザーを解決し、グループなしのクリーンアップを完了する", async () => {
    const runQuery = vi.fn().mockResolvedValueOnce(E2E_USER_ID).mockResolvedValueOnce(null);
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery }),
      request({ email: "user@example.test" }),
    );

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      receipts: null,
      monthlyIncome: null,
    });
  });

  it("グループがない状態で週次リセットを指定すると400を返す", async () => {
    const response = await e2eCleanupHandler(
      createActionCtx({ runQuery: vi.fn().mockResolvedValue(null) }),
      request({ userId: E2E_USER_ID, resetWeekSession: true }),
    );

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "groupId is required." });
  });

  it("全クリーンアップ項目を同一グループ・ユーザーの範囲で処理する", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ deletedCount: 1 })
      .mockResolvedValueOnce({ deletedDraftCount: 2, deletedItemCount: 3, hasMore: false })
      .mockResolvedValueOnce({ deletedBatchCount: 1, deletedJobCount: 2, hasMore: false })
      .mockResolvedValueOnce({ reset: true })
      .mockResolvedValueOnce({ deletedCount: 4 })
      .mockResolvedValueOnce({ cleared: true })
      .mockResolvedValueOnce({ deletedCount: 1, hasMore: false })
      .mockResolvedValueOnce({ deletedCount: 2 })
      .mockResolvedValueOnce({ deletedCount: 1 })
      .mockResolvedValueOnce({ updated: true })
      .mockResolvedValueOnce({ deletedCount: 1 })
      .mockResolvedValueOnce({ memberUserId: "member-e2e" });
    const response = await e2eCleanupHandler(
      createActionCtx({ runMutation }),
      request({
        userId: E2E_USER_ID,
        groupId: GROUP_ID,
        resetWeekSession: true,
        weekStartDate: "2026-08-03",
        deleteE2eCategories: true,
        clearMonthlyIncome: true,
        clearAiExpenseQueue: true,
        clearE2eExpenseEntries: true,
        clearGroupMemberships: true,
        clearGroupInvitations: true,
        clearLineLink: true,
        setGroupMemberRole: "member",
        seedGroupMember: { displayName: "  メンバー  ", email: " MEMBER@EXAMPLE.TEST " },
      }),
    );

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({
      receipts: { deletedCount: 1 },
      aiExpenseQueue: {
        deletedDraftCount: 2,
        deletedItemCount: 3,
        deletedBatchCount: 1,
        deletedJobCount: 2,
      },
      seededGroupMember: { memberUserId: "member-e2e" },
    });
    expect(runMutation).toHaveBeenCalledTimes(12);
  });
});

describe("e2e seed handlers", () => {
  beforeEach(configureEnvironment);

  it("税配分fixtureもsecret不一致・別ユーザー・本番環境を拒否する", async () => {
    const ctx = createActionCtx();
    await expect(
      e2eSeedUnallocatedTaxDraftHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      e2eSeedUnallocatedTaxDraftHandler(ctx, request({ userId: "clerk|other" })),
    ).resolves.toMatchObject({ status: 403 });
    process.env.APP_ENV = "production";
    expect(
      (await e2eSeedUnallocatedTaxDraftHandler(ctx, request({ userId: E2E_USER_ID }))).status,
    ).not.toBe(200);
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
  it("認証・入力・グループ認可の失敗を拒否する", async () => {
    const ctx = createActionCtx();
    await expect(
      e2eSeedAiExpenseDraftHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      e2eSeedTaxReviewDraftHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      e2eSeedMixedTaxReviewDraftHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      e2eSeedTaxSummaryConflictDraftHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      e2eSeedPendingGroupInvitationHandler(ctx, request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      e2eSeedAiExpenseDraftHandler(ctx, request({ userId: "clerk|other" })),
    ).resolves.toMatchObject({
      status: 403,
    });
    await expect(e2eSeedAiExpenseDraftHandler(ctx, request({}))).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      e2eSeedAiExpenseDraftHandler(
        createActionCtx({ runQuery: vi.fn().mockResolvedValue(null) }),
        request({ userId: E2E_USER_ID }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      e2eSeedAiExpenseDraftHandler(
        createActionCtx({
          runQuery: vi.fn().mockResolvedValueOnce(GROUP_ID).mockResolvedValueOnce("other"),
        }),
        request({ userId: E2E_USER_ID, groupId: "requested" }),
      ),
    ).resolves.toMatchObject({ status: 403 });
    await expect(e2eSeedAiExpenseDraftHandler(ctx, request({ userId: 1 }))).resolves.toMatchObject({
      status: 400,
    });
    await expect(e2eSeedTaxReviewDraftHandler(ctx, request({ userId: 1 }))).resolves.toMatchObject({
      status: 400,
    });
    await expect(
      e2eSeedTaxSummaryConflictDraftHandler(ctx, request({ groupId: "x".repeat(513) })),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      e2eSeedPendingGroupInvitationHandler(ctx, request({ invitationEmail: 1 })),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      e2eSeedPendingGroupInvitationHandler(ctx, request({ userId: E2E_USER_ID, groupId: "x" })),
    ).resolves.toMatchObject({ status: 400 });
  });

  it("5種類のseed処理を成功させる", async () => {
    const ctx = createActionCtx();
    const ready = await e2eSeedAiExpenseDraftHandler(ctx, request({ userId: E2E_USER_ID }));
    const tax = await e2eSeedTaxReviewDraftHandler(ctx, request({ userId: E2E_USER_ID }));
    const mixedTax = await e2eSeedMixedTaxReviewDraftHandler(ctx, request({ userId: E2E_USER_ID }));
    const conflict = await e2eSeedTaxSummaryConflictDraftHandler(
      createActionCtx({
        runQuery: vi.fn().mockResolvedValueOnce(E2E_USER_ID).mockResolvedValue(GROUP_ID),
      }),
      request({ email: "user@example.test" }),
    );
    const invitation = await e2eSeedPendingGroupInvitationHandler(
      ctx,
      request({ userId: E2E_USER_ID, invitationEmail: " MEMBER@EXAMPLE.TEST " }),
    );

    expect(ready.status).toBe(200);
    expect(tax.status).toBe(200);
    expect(mixedTax.status).toBe(200);
    expect(conflict.status).toBe(200);
    expect(invitation.status).toBe(200);
    await expect(responseJson(invitation)).resolves.toEqual({ invitationId: "fixture-id" });
  });

  it("招待メールの欠落・形式不正を拒否する", async () => {
    const ctx = createActionCtx();
    await expect(
      e2eSeedPendingGroupInvitationHandler(ctx, request({ userId: E2E_USER_ID })),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      e2eSeedPendingGroupInvitationHandler(
        ctx,
        request({ userId: E2E_USER_ID, invitationEmail: "x".repeat(321) }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      e2eSeedPendingGroupInvitationHandler(
        ctx,
        request({ userId: E2E_USER_ID, invitationEmail: "   " }),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });
});

describe("system admin fixture handlers", () => {
  beforeEach(configureEnvironment);

  it("seed/cleanupの成功・入力不正・認可失敗・内部失敗を返し分ける", async () => {
    const successCtx = createActionCtx({
      runMutation: vi.fn().mockResolvedValue({
        targetUserId: "target",
        groupA: "group-a",
        groupB: "group-b",
      }),
    });
    const seedMembership = await seedSystemAdminMembershipHandler(
      successCtx,
      request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-291-membership" }),
    );
    const cleanupMembership = await cleanupSystemAdminMembershipHandler(
      createActionCtx({ runMutation: vi.fn().mockResolvedValue(undefined) }),
      request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-291-membership" }),
    );
    const seedSearch = await seedSystemAdminSearchHandler(
      createActionCtx({
        runMutation: vi.fn().mockResolvedValue({ userCount: 25, groupCount: 24 }),
      }),
      request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-504-search" }),
    );
    const cleanupSearch = await cleanupSystemAdminSearchHandler(
      createActionCtx({ runMutation: vi.fn().mockResolvedValue(undefined) }),
      request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-504-search" }),
    );

    expect(seedMembership.status).toBe(200);
    expect(cleanupMembership.status).toBe(200);
    expect(seedSearch.status).toBe(200);
    expect(cleanupSearch.status).toBe(200);

    await expect(
      seedSystemAdminMembershipHandler(createActionCtx(), request({})),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      seedSystemAdminMembershipHandler(
        createActionCtx(),
        request({ actorUserId: "other", prefix: "x" }),
      ),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      seedSystemAdminMembershipHandler(
        createActionCtx({ runMutation: vi.fn().mockRejectedValue(new Error("internal")) }),
        request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-291-membership" }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminMembershipHandler(
        createActionCtx({ runMutation: vi.fn().mockRejectedValue(new Error("internal")) }),
        request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-291-membership" }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminMembershipHandler(createActionCtx(), request({})),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      seedSystemAdminMembershipHandler(createActionCtx(), request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      cleanupSystemAdminMembershipHandler(createActionCtx(), request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      seedSystemAdminMembershipHandler(
        createActionCtx(),
        rawRequest('{"actorUserId":"clerk|user_e2e"}'),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminMembershipHandler(
        createActionCtx(),
        rawRequest('{"actorUserId":"clerk|user_e2e"}'),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminMembershipHandler(
        createActionCtx(),
        request({ actorUserId: "other", prefix: "e2e-system-admin-291-membership" }),
      ),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      seedSystemAdminSearchHandler(
        createActionCtx({ runMutation: vi.fn().mockRejectedValue(new Error("internal")) }),
        request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-504-search" }),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      seedSystemAdminSearchHandler(createActionCtx(), request({ actorUserId: E2E_USER_ID })),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      seedSystemAdminSearchHandler(createActionCtx(), request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      seedSystemAdminSearchHandler(
        createActionCtx(),
        rawRequest('{"actorUserId":"clerk|user_e2e"}'),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      seedSystemAdminSearchHandler(
        createActionCtx(),
        request({ actorUserId: "other", prefix: "e2e-system-admin-504-search" }),
      ),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      cleanupSystemAdminSearchHandler(createActionCtx(), request({})),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminSearchHandler(createActionCtx(), request({}, "wrong-secret")),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      cleanupSystemAdminSearchHandler(
        createActionCtx(),
        rawRequest('{"actorUserId":"clerk|user_e2e"}'),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      cleanupSystemAdminSearchHandler(
        createActionCtx(),
        request({ actorUserId: "other", prefix: "e2e-system-admin-504-search" }),
      ),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      cleanupSystemAdminSearchHandler(
        createActionCtx({ runMutation: vi.fn().mockRejectedValue(new Error("internal")) }),
        request({ actorUserId: E2E_USER_ID, prefix: "e2e-system-admin-504-search" }),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });
});
