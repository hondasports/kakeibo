// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  invitationGroupOperations,
  withInvitationTestGroups,
} from "../../e2e/helpers/invitationGroups";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const actor = "invitation-e2e-actor";
type TestDatabase = ReturnType<typeof convexTest>;

async function addRelatedData(t: TestDatabase, groupId: Id<"groups">) {
  await t.run(async (ctx) => {
    const categoryId = await ctx.db.insert("categories", {
      groupId,
      name: "関連カテゴリ",
      color: "#000000",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("receipts", {
      groupId,
      categoryId,
      createdByUserId: actor,
      date: "2026-10-25",
      type: "expense",
      shopName: "テスト店舗",
      amountYen: 100,
      weekStartDate: "2026-10-19",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupInvitations", {
      groupId,
      email: "recipient@example.test",
      token: `fixture-${groupId}`,
      status: "pending",
      invitedByUserId: actor,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

async function readData(t: TestDatabase) {
  return await t.run(async (ctx) => ({
    groups: await ctx.db.query("groups").collect(),
    categories: await ctx.db.query("categories").collect(),
    memberships: await ctx.db.query("groupMembers").collect(),
    receipts: await ctx.db.query("receipts").collect(),
    invitations: await ctx.db.query("groupInvitations").collect(),
    activeGroupId: (
      await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", actor))
        .unique()
    )?.activeGroupId,
  }));
}

async function setup() {
  const t = convexTest(schema, convexTestModules);
  const client = t.withIdentity({ tokenIdentifier: actor, subject: actor });
  await t.run((ctx) =>
    ctx.db.insert("users", {
      userId: actor,
      displayName: "テスト利用者",
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  const unrelated = await client.mutation(api.groups.mutations.createGroup, {
    name: "既存グループ",
  });
  await addRelatedData(t, unrelated);
  const before = await readData(t);
  const operations = invitationGroupOperations(client, async (jobId) => {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await client.query(api.groups.deletion.getGroupDeletionStatus, { jobId })).toMatchObject(
      { status: "completed" },
    );
  });
  return { t, client, operations, before };
}

describe("招待E2Eの作成データの後片付け", () => {
  it("作成した2グループと関連データを除去し、同じactorの既存グループとデータを残す", async () => {
    const { t, operations, before } = await setup();
    await withInvitationTestGroups(operations, actor, async (createGroup) => {
      for (const name of ["招待先", "切替元"]) await addRelatedData(t, await createGroup(name));
    });
    expect(await readData(t)).toEqual(before);
  });

  it("同名の既存グループへ別sessionが切り替えても、確認済みID以外の削除を開始しない", async () => {
    const { t, client, operations, before } = await setup();
    const preexistingId = before.groups[0]._id;
    await t.run((ctx) => ctx.db.patch(preexistingId, { name: "同名の家計" }));
    const anotherSession = t.withIdentity({ tokenIdentifier: actor, subject: actor });
    const request = operations.requestDeletion;
    operations.requestDeletion = async (...args) => {
      await anotherSession.mutation(api.groups.mutations.setActiveGroup, {
        groupId: preexistingId,
      });
      return await request(...args);
    };
    let confirmed: Awaited<ReturnType<typeof readData>>;
    const outcome = await withInvitationTestGroups(operations, actor, async (createGroup) => {
      await addRelatedData(t, await createGroup("同名の家計"));
      confirmed = await readData(t);
    }).then(
      () => null,
      (error: unknown) => error,
    );
    const after = await readData(t);
    expect.soft(after.groups).toEqual(confirmed!.groups);
    expect.soft(after.categories).toEqual(confirmed!.categories);
    expect.soft(after.receipts).toEqual(confirmed!.receipts);
    expect.soft(after.invitations).toEqual(confirmed!.invitations);
    expect.soft(after.memberships).toEqual(confirmed!.memberships);
    const sideEffects = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("groupDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      audits: await ctx.db.query("managementAuditLogs").collect(),
      recipients: await ctx.db.query("groupDeletionNotificationRecipients").collect(),
      emails: await ctx.db.query("transactionalEmailJobs").collect(),
    }));
    for (const rows of Object.values(sideEffects)) expect.soft(rows).toHaveLength(0);
    expect.soft(outcome).toBeInstanceOf(Error);
    expect.soft((outcome as Error)?.message).toContain("削除対象のグループが変わりました");
    expect(after.activeGroupId).toBe(preexistingId);
    expect(await client.query(api.groups.queries.getMyGroup, {})).toMatchObject({
      _id: preexistingId,
    });
  });

  it("テスト本体が失敗しても2グループを削除し、元の例外を残す", async () => {
    const { t, operations, before } = await setup();
    const failure = new Error("invitation assertion failed");
    await expect(
      withInvitationTestGroups(operations, actor, async (createGroup) => {
        for (const name of ["招待先", "切替元"]) await addRelatedData(t, await createGroup(name));
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await readData(t)).toEqual(before);
  });

  it("一方のcleanupが失敗しても他方を削除し、本体とcleanup双方の例外を返す", async () => {
    const { t, operations, before } = await setup();
    const bodyFailure = new Error("assertion failed");
    const cleanupFailure = new Error("first cleanup failed");
    const original = operations.requestDeletion;
    operations.requestDeletion = vi
      .fn()
      .mockRejectedValueOnce(cleanupFailure)
      .mockImplementation(original);
    const created: Id<"groups">[] = [];
    const result = withInvitationTestGroups(operations, actor, async (createGroup) => {
      for (const name of ["招待先", "切替元"]) {
        const id = await createGroup(name);
        created.push(id);
        await addRelatedData(t, id);
      }
      throw bodyFailure;
    });
    await expect(result).rejects.toMatchObject({ errors: [bodyFailure, cleanupFailure] });
    expect(operations.requestDeletion).toHaveBeenNthCalledWith(1, "切替元", created[1]);
    expect(operations.requestDeletion).toHaveBeenNthCalledWith(2, "招待先", created[0]);
    const after = await readData(t);
    for (const rows of [
      after.groups,
      after.categories,
      after.memberships,
      after.receipts,
      after.invitations,
    ]) {
      expect(rows.some((row) => ("groupId" in row ? row.groupId : row._id) === created[0])).toBe(
        false,
      );
      expect(rows.some((row) => ("groupId" in row ? row.groupId : row._id) === created[1])).toBe(
        true,
      );
    }
    expect(after.groups.filter((g) => g._id !== created[1])).toEqual(before.groups);
    expect(after.categories.filter((c) => c.groupId !== created[1])).toEqual(before.categories);
    expect(after.activeGroupId).toBe(before.activeGroupId);
  });

  it("2件目の作成が失敗しても記録済みの1件を削除する", async () => {
    const { t, operations, before } = await setup();
    const failure = new Error("second creation failed");
    const original = operations.createGroup;
    operations.createGroup = vi
      .fn()
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(failure);
    await expect(
      withInvitationTestGroups(operations, actor, async (createGroup) => {
        await addRelatedData(t, await createGroup("招待先"));
        await createGroup("切替元");
      }),
    ).rejects.toBe(failure);
    expect(await readData(t)).toEqual(before);
  });

  it("3件目を作成せず、記録した2件だけを削除する", async () => {
    const { t, operations, before } = await setup();
    const create = vi.spyOn(operations, "createGroup");
    await expect(
      withInvitationTestGroups(operations, actor, async (createGroup) => {
        await createGroup("招待先");
        await createGroup("切替元");
        await createGroup("余分なグループ");
      }),
    ).rejects.toThrow("at most two groups");
    expect(create).toHaveBeenCalledTimes(2);
    expect(await readData(t)).toEqual(before);
  });

  it("同時要求でも3件目を作成せず、記録した2件を削除する", async () => {
    const { t, operations, before } = await setup();
    const create = vi.spyOn(operations, "createGroup");
    await withInvitationTestGroups(operations, actor, async (createGroup) => {
      const results = await Promise.allSettled([
        createGroup("招待先"),
        createGroup("切替元"),
        createGroup("余分なグループ"),
      ]);
      expect(results.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
        "rejected",
      ]);
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(await readData(t)).toEqual(before);
  });

  it("actor不一致は作成前に拒否する", async () => {
    const { t, operations, before } = await setup();
    const create = vi.spyOn(operations, "createGroup");
    await expect(
      withInvitationTestGroups(operations, "another-actor", async (createGroup) =>
        createGroup("招待先"),
      ),
    ).rejects.toThrow("actor changed");
    expect(create).not.toHaveBeenCalled();
    expect(await readData(t)).toEqual(before);
  });

  it.each(["wrong-id", "not-owner"])("%s の確認結果では削除を開始しない", async (kind) => {
    const { t, operations, before } = await setup();
    const readGroup = operations.getCurrentGroup;
    operations.getCurrentGroup = vi
      .fn()
      .mockImplementationOnce(readGroup)
      .mockImplementation(async () => {
        const group = await readGroup();
        return kind === "wrong-id"
          ? { ...group!, _id: before.groups[0]._id }
          : { ...group!, role: "member" as const };
      });
    const request = vi.spyOn(operations, "requestDeletion");
    await expect(
      withInvitationTestGroups(operations, actor, async (createGroup) => createGroup("招待先")),
    ).rejects.toThrow("target does not match");
    expect(request).not.toHaveBeenCalled();
    expect((await readData(t)).groups.filter((g) => g._id === before.groups[0]._id)).toEqual(
      before.groups,
    );
  });
});
