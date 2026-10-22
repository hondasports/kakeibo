// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { buildDraftListSummary } from "../../lib/domain/aiExpenseDrafts/listSummary";
import {
  draftDocToFields,
  draftItemDocToFields,
} from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";

const originalAppEnv = process.env.APP_ENV;
const originalUserId = process.env.E2E_CLERK_USER_ID;

afterEach(() => {
  if (originalAppEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = originalAppEnv;
  if (originalUserId === undefined) delete process.env.E2E_CLERK_USER_ID;
  else process.env.E2E_CLERK_USER_ID = originalUserId;
});

function configure(actorUserId: string) {
  process.env.APP_ENV = "development";
  process.env.E2E_CLERK_USER_ID = actorUserId;
}

async function createActor(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      userId: "clerk|fixture-actor",
      displayName: "Fixture actor",
      email: "fixture-actor@example.test",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
}

describe("system admin E2E fixtures", () => {
  it("membership fixtureを作成し、再作成とcleanupまで完了する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    configure(actorUserId);
    await createActor(t);

    const first = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      {
        actorUserId,
        prefix: "e2e-system-admin-291-membership",
      },
    );
    const second = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      {
        actorUserId,
        prefix: "e2e-system-admin-291-membership",
      },
    );

    expect(first.groupA).not.toBe(second.groupA);
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "e2e-system-admin-291-membership",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("membership fixtureは本番環境・不正prefix・未登録actorを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    await createActor(t);

    process.env.APP_ENV = "production";
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "e2e-system-admin-291-membership",
      }),
    ).rejects.toThrow("disabled in production");

    configure(actorUserId);
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "invalid-prefix",
      }),
    ).rejects.toThrow("invalid fixture prefix");
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
        actorUserId: "clerk|other",
        prefix: "e2e-system-admin-291-membership",
      }),
    ).rejects.toThrow("not authorized");
  });

  it("membership cleanupはグループメンバー数の上限を超えたfixtureを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    configure(actorUserId);
    await createActor(t);
    const fixture = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      { actorUserId, prefix: "e2e-system-admin-291-too-many-members" },
    );

    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("groupMembers", {
          groupId: fixture.groupA,
          userId: `overflow-member-${index}`,
          role: "member",
          createdAt: index,
          updatedAt: index,
        });
      }
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "e2e-system-admin-291-too-many-members",
      }),
    ).rejects.toThrow("too many members");
  });

  it("membership cleanupは通知数の上限を超えたfixtureを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    configure(actorUserId);
    await createActor(t);
    const fixture = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      { actorUserId, prefix: "e2e-system-admin-291-too-many-notifications" },
    );

    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("systemAdminNotifications", {
          action: "system_admin_membership_changed",
          recipientUserId: fixture.targetUserId,
          targetUserId: fixture.targetUserId,
          dedupeKey: `overflow-notification-${index}`,
          payloadJson: "{}",
          createdAt: index,
        });
      }
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "e2e-system-admin-291-too-many-notifications",
      }),
    ).rejects.toThrow("too many notifications");
  });

  it("membership cleanupは対象ユーザーの所属数の上限を超えたfixtureを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-291-too-many-target-memberships";
    configure(actorUserId);
    await createActor(t);
    const fixture = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      { actorUserId, prefix },
    );

    await t.run(async (ctx) => {
      const overflowGroupId = await ctx.db.insert("groups", {
        name: "membership overflow group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("groupMembers", {
          groupId: overflowGroupId,
          userId: `${prefix}|target`,
          role: "member",
          createdAt: index,
          updatedAt: index,
        });
      }
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix,
      }),
    ).rejects.toThrow("too many memberships");
    expect(fixture.targetUserId).toBeDefined();
  });

  it("membership cleanupは監査ログ数の上限を超えたfixtureを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-291-too-many-audits";
    configure(actorUserId);
    await createActor(t);
    const fixture = await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture,
      { actorUserId, prefix },
    );

    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("systemAdminAuditLogs", {
          action: "system_admin_membership_added",
          actorType: "system_admin",
          actorUserId: fixture.targetUserId,
          targetKind: "user",
          targetUserId: fixture.targetUserId,
          createdAt: index,
        });
      }
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix,
      }),
    ).rejects.toThrow("too many audit logs");
  });

  it("membership fixtureは存在しないactorを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|missing-actor";
    configure(actorUserId);

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
        actorUserId,
        prefix: "e2e-system-admin-291-missing-actor",
      }),
    ).rejects.toThrow("actor user not found");
  });

  it("membership cleanupはactorが削除済みでもfixtureを削除できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-291-deleted-actor";
    configure(actorUserId);
    const actorId = await createActor(t);
    await t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
      actorUserId,
      prefix,
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(actorId);
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture, {
        actorUserId,
        prefix,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("membership cleanupはE2E由来ではないadminを削除しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-291-existing-admin";
    configure(actorUserId);
    const actorId = await createActor(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("systemAdmins", {
        userId: actorId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "manual",
      });
    });
    await t.mutation(internal.e2eHttp.e2eSystemAdminMembership.seedSystemAdminMembershipFixture, {
      actorUserId,
      prefix,
    });

    await t.mutation(
      internal.e2eHttp.e2eSystemAdminMembership.cleanupSystemAdminMembershipFixture,
      {
        actorUserId,
        prefix,
      },
    );

    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", actorId))
        .unique();
      expect(admin?.grantReason).toBe("manual");
    });
  });

  it("search fixtureを作成し、cleanupで関連データを削除する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    configure(actorUserId);
    await createActor(t);

    const result = await t.mutation(
      internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture,
      {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      },
    );
    expect(result).toEqual({ userCount: 25, groupCount: 24 });

    const recreated = await t.mutation(
      internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture,
      {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      },
    );
    expect(recreated).toEqual({ userCount: 25, groupCount: 24 });

    await t.run(async (ctx) => {
      const fixture = await ctx.db
        .query("e2eSystemAdminSearchFixtures")
        .withIndex("by_prefix", (q) => q.eq("prefix", "e2e-system-admin-504-search"))
        .unique();
      if (!fixture) throw new Error("fixture not found");
      await ctx.db.insert("systemAdminAuditLogs", {
        action: "system_admin_user_searched",
        actorType: "system_admin",
        actorUserId: fixture.actorUserId,
        targetKind: "user",
        targetUserId: fixture.userIds[0],
        createdAt: Date.now() + 1,
      });
      await ctx.db.insert("systemAdminAuditLogs", {
        action: "system_admin_user_searched",
        actorType: "system_admin",
        actorUserId: fixture.actorUserId,
        targetKind: "user",
        targetUserId: fixture.userIds[0],
        createdAt: fixture.createdAt - 1,
      });
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("search fixtureはrevoked adminを拒否し、不正環境も拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    configure(actorUserId);
    const actorId = await createActor(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("systemAdmins", {
        userId: actorId,
        status: "revoked",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "existing",
      });
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      }),
    ).rejects.toThrow("revoked");

    delete process.env.E2E_CLERK_USER_ID;
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      }),
    ).rejects.toThrow("not authorized");

    configure(actorUserId);
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
        actorUserId,
        prefix: "invalid-prefix",
      }),
    ).rejects.toThrow("invalid fixture prefix");

    process.env.APP_ENV = "production";
    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
        actorUserId,
        prefix: "e2e-system-admin-504-search",
      }),
    ).rejects.toThrow("disabled in production");
  });

  it("search fixtureは既存adminを維持する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-504-existing-admin";
    configure(actorUserId);
    const actorId = await createActor(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("systemAdmins", {
        userId: actorId,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        grantedAt: 1,
        grantReason: "manual",
      });
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
        actorUserId,
        prefix,
      }),
    ).resolves.toEqual({ userCount: 25, groupCount: 24 });
    await t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
      actorUserId,
      prefix,
    });

    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", actorId))
        .unique();
      expect(admin?.grantReason).toBe("manual");
    });
  });

  it("search cleanupはE2E由来adminのgrantReasonが変わっていれば削除しない", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-504-changed-admin";
    configure(actorUserId);
    const actorId = await createActor(t);
    await t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
      actorUserId,
      prefix,
    });
    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", actorId))
        .unique();
      if (!admin) throw new Error("admin not found");
      await ctx.db.patch(admin._id, { grantReason: "manual" });
    });

    await t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
      actorUserId,
      prefix,
    });

    await t.run(async (ctx) => {
      const admin = await ctx.db
        .query("systemAdmins")
        .withIndex("by_user_id", (q) => q.eq("userId", actorId))
        .unique();
      expect(admin?.grantReason).toBe("manual");
    });
  });

  it("search fixtureは存在しないactorを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|missing-search-actor";
    configure(actorUserId);

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
        actorUserId,
        prefix: "e2e-system-admin-504-missing-actor",
      }),
    ).rejects.toThrow("actor user not found");
  });

  it("search cleanupは監査ログの作成時刻が古いものを残す", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-504-old-audit";
    configure(actorUserId);
    await createActor(t);
    await t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
      actorUserId,
      prefix,
    });
    await t.run(async (ctx) => {
      const fixture = await ctx.db
        .query("e2eSystemAdminSearchFixtures")
        .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
        .unique();
      if (!fixture) throw new Error("fixture not found");
      await ctx.db.insert("systemAdminAuditLogs", {
        action: "system_admin_user_searched",
        actorType: "system_admin",
        actorUserId: fixture.actorUserId,
        targetKind: "user",
        targetUserId: fixture.userIds[0],
        createdAt: fixture.createdAt - 1,
      });
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
        actorUserId,
        prefix,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("search cleanupは監査ログ数の上限を超えたfixtureを拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    const actorUserId = "clerk|fixture-actor";
    const prefix = "e2e-system-admin-504-too-many-audits";
    configure(actorUserId);
    await createActor(t);
    await t.mutation(internal.e2eHttp.e2eSystemAdminSearch.seedSystemAdminSearchFixture, {
      actorUserId,
      prefix,
    });

    await t.run(async (ctx) => {
      const fixture = await ctx.db
        .query("e2eSystemAdminSearchFixtures")
        .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
        .unique();
      if (!fixture) throw new Error("fixture not found");
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("systemAdminAuditLogs", {
          action: "system_admin_user_searched",
          actorType: "system_admin",
          actorUserId: fixture.actorUserId,
          targetKind: "user",
          targetUserId: fixture.userIds[0],
          createdAt: fixture.createdAt + index,
        });
      }
    });

    await expect(
      t.mutation(internal.e2eHttp.e2eSystemAdminSearch.cleanupSystemAdminSearchFixture, {
        actorUserId,
        prefix,
      }),
    ).rejects.toThrow("too many audit logs");
  });
});

describe("AI expense E2E fixtures", () => {
  it("ready・税レビュー・税集計下書きを作成し、ユーザー単位で削除できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "AI fixture group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await ctx.db.insert("categories", {
        groupId,
        name: "食費",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      const secondaryCategoryId = await ctx.db.insert("categories", {
        groupId,
        name: "日用品",
        color: "#A6B28B",
        isActive: true,
        sortOrder: 2,
        createdAt: 1,
        updatedAt: 1,
      });
      return { groupId, categoryId, secondaryCategoryId };
    });

    const readyDraftId = await t.mutation(
      internal.aiExpenseDrafts.internal.createE2eReadyDraftForUser,
      {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
        secondaryCategoryId: ids.secondaryCategoryId,
      },
    );
    await t.mutation(internal.aiExpenseDrafts.internal.createE2eReadyDraftForUser, {
      groupId: ids.groupId,
      createdByUserId: "fixture-user",
      categoryId: ids.categoryId,
    });
    await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
      groupId: ids.groupId,
      createdByUserId: "fixture-user",
      categoryId: ids.categoryId,
    });
    await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxSummaryConflictDraftForUser, {
      groupId: ids.groupId,
      createdByUserId: "fixture-user",
      categoryId: ids.categoryId,
    });

    const firstBatch = await t.mutation(internal.aiExpenseDrafts.internal.deleteDraftsByUserBatch, {
      groupId: ids.groupId,
      userId: "fixture-user",
      limit: 1,
    });
    const secondBatch = await t.mutation(
      internal.aiExpenseDrafts.internal.deleteDraftsByUserBatch,
      {
        groupId: ids.groupId,
        userId: "fixture-user",
        limit: 100,
      },
    );

    expect(firstBatch).toEqual({ deletedDraftCount: 1, deletedItemCount: 3, hasMore: true });
    expect(secondBatch).toEqual({ deletedDraftCount: 3, deletedItemCount: 5, hasMore: false });
    expect(readyDraftId).toBeDefined();
  });

  it("seed で作る下書きは一覧用の listSummary を保存済みにする", async () => {
    const t = convexTest(schema, convexTestModules);
    const ids = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "AI fixture group",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const categoryId = await ctx.db.insert("categories", {
        groupId,
        name: "食費",
        color: "#AAB7C4",
        isActive: true,
        sortOrder: 1,
        createdAt: 1,
        updatedAt: 1,
      });
      return { groupId, categoryId };
    });

    const draftIds = [
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eReadyDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eMixedTaxReviewDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxSummaryConflictDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eUnallocatedTaxDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
        receiptCase: "unproven1003",
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
        receiptCase: "summary892",
      }),
      await t.mutation(internal.aiExpenseDrafts.internal.createE2eTaxReviewDraftForUser, {
        groupId: ids.groupId,
        createdByUserId: "fixture-user",
        categoryId: ids.categoryId,
        receiptCase: "basis890",
      }),
    ];

    for (const draftId of draftIds) {
      const { draft, items } = await t.run(async (ctx) => ({
        draft: await ctx.db.get(draftId),
        items: await ctx.db
          .query("aiExpenseDraftItems")
          .withIndex("by_group_id_and_draft_id", (q) =>
            q.eq("groupId", ids.groupId).eq("draftId", draftId),
          )
          .order("asc")
          .collect(),
      }));
      expect(draft).not.toBeNull();
      const expected = buildDraftListSummary(
        draftDocToFields(draft!),
        items.map(draftItemDocToFields),
      );
      expect(draft!.listSummary).toEqual(expected);
    }
  });
});
