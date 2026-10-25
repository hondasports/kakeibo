// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

import { createGroupMutationDeps } from "../../lib/convex/groups/groupUsecaseDeps";
import { requestGroupDeletion } from "../../lib/usecase/groups/requestGroupDeletion";

const ownerId = "deletion-expected-group-owner";
const memberId = "deletion-expected-group-member";
const groupName = "同名の家計";

async function setup() {
  const t = convexTest(schema, convexTestModules);
  await t.run((ctx) =>
    ctx.db.insert("users", { userId: ownerId, displayName: "owner", createdAt: 1, updatedAt: 1 }),
  );
  const owner = t.withIdentity({ tokenIdentifier: ownerId, subject: ownerId });
  const existing = await owner.mutation(api.groups.mutations.createGroup, { name: groupName });
  const intended = await owner.mutation(api.groups.mutations.createGroup, { name: groupName });
  await t.run(async (ctx) => {
    for (const groupId of [existing, intended]) {
      await ctx.db.insert("categories", {
        groupId,
        name: "残すカテゴリ",
        color: "#000000",
        isActive: true,
        sortOrder: 0,
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  const snapshot = () =>
    t.run(async (ctx) => ({
      groups: await ctx.db.query("groups").collect(),
      categories: await ctx.db.query("categories").collect(),
      memberships: await ctx.db.query("groupMembers").collect(),
      users: await ctx.db.query("users").collect(),
      jobs: await ctx.db.query("groupDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      audits: await ctx.db.query("managementAuditLogs").collect(),
      recipients: await ctx.db.query("groupDeletionNotificationRecipients").collect(),
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
    }));
  return { t, owner, existing, intended, snapshot };
}

describe("owner削除mutationの期待グループID", () => {
  it("別sessionが同名の既存グループへ切り替えた後はID不一致を副作用なしで拒否する", async () => {
    const { t, owner, existing, intended, snapshot } = await setup();
    await t
      .withIdentity({ tokenIdentifier: ownerId, subject: ownerId })
      .mutation(api.groups.mutations.setActiveGroup, { groupId: existing });
    const before = await snapshot();
    await expect(
      owner.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: groupName,
        expectedGroupId: intended,
      }),
    ).rejects.toThrow("削除対象のグループが変わりました");
    expect(await snapshot()).toEqual(before);
  });

  it("ID不一致はworkflow開始やuser更新の呼出しより前に拒否する", async () => {
    const { t, existing, intended } = await setup();
    await t.run(async (ctx) => {
      const deps = createGroupMutationDeps(ctx);
      const start = vi.spyOn(deps.deletionWorkflow, "start");
      const setActiveGroup = vi.spyOn(deps.users, "setActiveGroup");
      await expect(
        requestGroupDeletion({ groupId: existing, userId: ownerId }, deps, {
          confirmationGroupName: groupName,
          expectedGroupId: intended,
        }),
      ).rejects.toThrow("削除対象のグループが変わりました");
      expect(start).not.toHaveBeenCalled();
      expect(setActiveGroup).not.toHaveBeenCalled();
    });
  });

  it.each(["expected-id", "legacy-without-id"] as const)(
    "%s のownerリクエストは従来の削除workflowを開始する",
    async (mode) => {
      const { owner, intended, existing, snapshot } = await setup();
      const jobId = await owner.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: groupName,
        ...(mode === "expected-id" ? { expectedGroupId: intended } : {}),
      });
      const after = await snapshot();
      expect(after.groups.find((g) => g._id === intended)?.status).toBe("deleting");
      expect(after.groups.find((g) => g._id === existing)?.status).toBe("active");
      expect(after.jobs).toHaveLength(1);
      expect(after.jobs[0]).toMatchObject({
        _id: jobId,
        targetGroupIdSnapshot: intended,
        source: "owner",
        actorUserIdSnapshot: ownerId,
        status: "requested",
        isActive: true,
      });
      expect(after.scheduled).toHaveLength(1);
      expect(after.users.find((u) => u.userId === ownerId)?.activeGroupId).toBeUndefined();
    },
  );

  it("期待IDが一致しても確認名が違えば副作用なしで拒否する", async () => {
    const { owner, intended, snapshot } = await setup();
    const before = await snapshot();
    await expect(
      owner.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: "別の家計",
        expectedGroupId: intended,
      }),
    ).rejects.toThrow("グループ名が一致しません");
    expect(await snapshot()).toEqual(before);
  });

  it("未認証では期待IDを指定しても拒否する", async () => {
    const { t, intended, snapshot } = await setup();
    const before = await snapshot();
    await expect(
      t.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: groupName,
        expectedGroupId: intended,
      }),
    ).rejects.toThrow("Not authenticated");
    expect(await snapshot()).toEqual(before);
  });

  it("期待IDはowner認可の代わりにならず、memberの削除要求を拒否する", async () => {
    const { t, intended, snapshot } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: memberId,
        displayName: "member",
        activeGroupId: intended,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("groupMembers", {
        groupId: intended,
        userId: memberId,
        role: "member",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const before = await snapshot();
    await expect(
      t
        .withIdentity({ tokenIdentifier: memberId, subject: memberId })
        .mutation(api.groups.deletion.requestGroupDeletion, {
          confirmationGroupName: groupName,
          expectedGroupId: intended,
        }),
    ).rejects.toThrow("グループオーナーのみ実行できます");
    expect(await snapshot()).toEqual(before);
  });

  it("形式不正な期待IDを拒否し、削除を予約しない", async () => {
    const { owner, snapshot } = await setup();
    const before = await snapshot();
    await expect(
      owner.mutation(api.groups.deletion.requestGroupDeletion, {
        confirmationGroupName: groupName,
        expectedGroupId: "not-a-group-id" as Id<"groups">,
      }),
    ).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
});
