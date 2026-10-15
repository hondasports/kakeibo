// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const userId = "https://issuer.example|subscriber";

it("所属削除後の設定購読は空結果になり、strict queryとmutationは拒否を維持する", async () => {
  const t = convexTest(schema, convexTestModules);
  const { memberId } = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "家計",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const memberId = await ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    return { memberId };
  });
  const client = t.withIdentity({ tokenIdentifier: userId });
  expect(
    await client.query(api.groups.queries.getGroupMembers, { allowUnavailable: true }),
  ).toHaveLength(1);
  await t.run(async (ctx) => {
    await ctx.db.delete(memberId);
  });
  expect(
    await client.query(api.groups.queries.getGroupMembers, { allowUnavailable: true }),
  ).toEqual([]);
  expect(
    await client.query(api.groups.queries.listPendingGroupInvitations, { allowUnavailable: true }),
  ).toEqual([]);
  expect(
    await client.query(api.groups.auditLogs.listManagementAuditLogs, { allowUnavailable: true }),
  ).toEqual([]);
  expect(
    await client.query(api.categories.queries.listForSettings, { allowUnavailable: true }),
  ).toEqual([]);
  expect(
    await client.query(api.groups.deletion.getGroupDeletionPreview, { allowUnavailable: true }),
  ).toBeNull();
  await expect(client.query(api.groups.queries.getGroupMembers, {})).rejects.toThrow(
    "グループに所属していません",
  );
  await expect(
    client.mutation(api.groups.mutations.updateGroupName, { name: "変更" }),
  ).rejects.toThrow();
});

it("ownerからmemberになった購読は招待・監査・削除情報を返さない", async () => {
  const t = convexTest(schema, convexTestModules);
  const memberId = await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "家計",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    return ctx.db.insert("groupMembers", {
      groupId,
      userId,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
  });
  const client = t.withIdentity({ tokenIdentifier: userId });
  expect(
    await client.query(api.groups.deletion.getGroupDeletionPreview, { allowUnavailable: true }),
  ).not.toBeNull();
  await t.run(async (ctx) => {
    await ctx.db.patch(memberId, { role: "member" });
  });
  expect(
    await client.query(api.groups.deletion.getGroupDeletionPreview, { allowUnavailable: true }),
  ).toBeNull();
  expect(
    await client.query(api.groups.queries.listPendingGroupInvitations, { allowUnavailable: true }),
  ).toEqual([]);
  expect(
    await client.query(api.groups.auditLogs.listManagementAuditLogs, { allowUnavailable: true }),
  ).toEqual([]);
  await expect(client.query(api.groups.deletion.getGroupDeletionPreview, {})).rejects.toThrow(
    "グループオーナーのみ",
  );
});

it("optional購読でも未認証は拒否する", async () => {
  const t = convexTest(schema, convexTestModules);
  await expect(
    t.query(api.groups.queries.getGroupMembers, { allowUnavailable: true }),
  ).rejects.toThrow("Not authenticated");
  await expect(
    t.query(api.groups.deletion.getGroupDeletionPreview, { allowUnavailable: true }),
  ).rejects.toThrow("Not authenticated");
});
