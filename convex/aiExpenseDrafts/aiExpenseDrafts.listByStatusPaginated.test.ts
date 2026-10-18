// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const TEST_USER_ID = "queue-user";

async function seedGroupWithRegisteredDrafts(t: ReturnType<typeof convexTest>, draftCount: number) {
  await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "ページング確認グループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("users", {
      userId: TEST_USER_ID,
      displayName: "キューユーザー",
      activeGroupId: groupId,
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.insert("groupMembers", {
      groupId,
      userId: TEST_USER_ID,
      role: "owner",
      createdAt: 1,
      updatedAt: 1,
    });
    for (let i = 0; i < draftCount; i += 1) {
      await ctx.db.insert("aiExpenseDrafts", {
        groupId,
        sourceType: "image_upload",
        status: "registered",
        documentType: "receipt",
        shopName: `登録済み店舗${i + 1}`,
        confidence: {},
        reviewReasons: [],
        createdAt: i + 1,
        updatedAt: i + 1,
      });
    }
  });
}

describe("aiExpenseDrafts.queries.listByStatusPaginated", () => {
  it("登録済み下書きは numItems を超えて読まず、continueCursor で続きを取得できる", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedGroupWithRegisteredDrafts(t, 15);
    const asUser = t.withIdentity({
      tokenIdentifier: TEST_USER_ID,
      subject: "clerk-queue-user",
      issuer: "https://issuer.example",
    });

    const firstPage = await asUser.query(api.aiExpenseDrafts.queries.listByStatusPaginated, {
      status: "registered",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(firstPage.page).toHaveLength(10);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.page[0]?.shopName).toBe("登録済み店舗15");
    expect(firstPage.page[9]?.shopName).toBe("登録済み店舗6");
    expect(firstPage.page[0]).not.toHaveProperty("items");

    const secondPage = await asUser.query(api.aiExpenseDrafts.queries.listByStatusPaginated, {
      status: "registered",
      paginationOpts: { numItems: 10, cursor: firstPage.continueCursor },
    });

    expect(secondPage.page).toHaveLength(5);
    expect(secondPage.isDone).toBe(true);
    expect(secondPage.page[4]?.shopName).toBe("登録済み店舗1");
  });
});
