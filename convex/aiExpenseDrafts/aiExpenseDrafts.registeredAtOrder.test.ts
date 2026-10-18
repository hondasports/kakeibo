// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { convexTestModules } from "../test.setup";

const TEST_USER_ID = "registered-order-user";
const identity = {
  tokenIdentifier: TEST_USER_ID,
  subject: `clerk-${TEST_USER_ID}`,
  issuer: "https://issuer.example",
};

type Seed = { groupId: Id<"groups">; categoryId: Id<"categories"> };

async function seedGroup(t: ReturnType<typeof convexTest>): Promise<Seed> {
  return await t.run(async (ctx) => {
    const groupId = await ctx.db.insert("groups", {
      name: "登録順確認グループ",
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
    const categoryId = await ctx.db.insert("categories", {
      groupId,
      name: "食費",
      color: "#f97316",
      isActive: true,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    });
    return { groupId, categoryId };
  });
}

function draftSeed(groupId: Id<"groups">, fields: Record<string, unknown>) {
  return {
    groupId,
    sourceType: "image_upload",
    documentType: "receipt",
    confidence: {},
    reviewReasons: [],
    ...fields,
  };
}

function derivedSeed(categoryId: Id<"categories">, registeredAt: number) {
  return {
    source: "derived" as const,
    destination: "expense_entries" as const,
    registrationMode: "detailed" as const,
    amountYen: 1200,
    date: "2026-08-26",
    categoryIds: [categoryId],
    registeredAt,
  };
}

async function listRegisteredIds(
  t: ReturnType<typeof convexTest>,
  numItems = 10,
): Promise<Id<"aiExpenseDrafts">[]> {
  const page = await t
    .withIdentity(identity)
    .query(api.aiExpenseDrafts.queries.listByStatusPaginated, {
      status: "registered",
      paginationOpts: { numItems, cursor: null },
    });
  return page.page.map((doc) => doc._id);
}

describe("登録済み下書き一覧の登録日時降順", () => {
  it("作成日時が古い下書きを登録すると、登録済み一覧の初回ページ先頭に出る", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const readyDraftId = await t.run(async (ctx) => {
      for (let i = 0; i < 10; i += 1) {
        await ctx.db.insert(
          "aiExpenseDrafts",
          draftSeed(groupId, {
            status: "registered",
            shopName: `既に登録済み${i + 1}`,
            derivedRegistration: derivedSeed(categoryId, 2000 + i),
            createdAt: 100 + i,
            updatedAt: 100 + i,
          }),
        );
      }
      return await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "ready",
          shopName: "長く確認待ちだった下書き",
          date: "2026-10-01",
          amountYen: 1200,
          categoryId,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
    });

    await t
      .withIdentity(identity)
      .mutation(api.aiExpenseDrafts.mutations.registerReadyDraftsAsExpenseEntries, {
        draftIds: [readyDraftId],
      });

    expect((await listRegisteredIds(t))[0]).toBe(readyDraftId);

    const doc = await t.run(async (ctx) => await ctx.db.get(readyDraftId));
    expect(doc?.registeredAt).toEqual(expect.any(Number));
    expect(doc?.registeredAt).toBe(doc?.derivedRegistration?.registeredAt);
  });

  it("登録日時の降順で並び、作成日時の順序には従わない", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ids = await t.run(async (ctx) => {
      const oldestCreated = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          shopName: "作成は古いが最近登録",
          derivedRegistration: derivedSeed(categoryId, 3000),
          registeredAt: 3000,
          createdAt: 1,
          updatedAt: 1,
        }),
      );
      const newestCreated = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          shopName: "作成は新しいが以前に登録",
          derivedRegistration: derivedSeed(categoryId, 1000),
          registeredAt: 1000,
          createdAt: 9000,
          updatedAt: 9000,
        }),
      );
      const middle = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          shopName: "中間",
          derivedRegistration: derivedSeed(categoryId, 2000),
          registeredAt: 2000,
          createdAt: 5000,
          updatedAt: 5000,
        }),
      );
      return { oldestCreated, newestCreated, middle };
    });

    expect(await listRegisteredIds(t)).toEqual([ids.oldestCreated, ids.middle, ids.newestCreated]);
  });

  it("registeredAt 未設定の登録済み下書きは、設定済みより後に並ぶ（backfill 前のデータ）", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const ids = await t.run(async (ctx) => {
      const withField = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          shopName: "backfill 済み",
          derivedRegistration: derivedSeed(categoryId, 1000),
          registeredAt: 1000,
          createdAt: 100,
          updatedAt: 100,
        }),
      );
      // backfill 前のデータを模すため、registeredAt を持たず最も新しい createdAt で挿入する。
      const withoutField = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          shopName: "backfill 前",
          derivedRegistration: derivedSeed(categoryId, 2000),
          createdAt: 9999,
          updatedAt: 9999,
        }),
      );
      return { withField, withoutField };
    });

    expect(await listRegisteredIds(t)).toEqual([ids.withField, ids.withoutField]);
  });
});

describe("登録・登録済み編集の各経路でトップレベル registeredAt を derivedRegistration と同じ値にする", () => {
  it("registerReadyDrafts（receipt 登録）も登録日時を書く", async () => {
    const t = convexTest(schema, convexTestModules);
    const { groupId, categoryId } = await seedGroup(t);
    const readyDraftId = await t.run(async (ctx) =>
      ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "ready",
          shopName: "レシート登録する下書き",
          date: "2026-10-01",
          amountYen: 1200,
          categoryId,
          createdAt: 1,
          updatedAt: 1,
        }),
      ),
    );

    await t.withIdentity(identity).mutation(api.aiExpenseDrafts.mutations.registerReadyDrafts, {
      draftIds: [readyDraftId],
    });

    const doc = await t.run(async (ctx) => await ctx.db.get(readyDraftId));
    expect(doc?.status).toBe("registered");
    expect(doc?.registeredReceiptId).toBeDefined();
    expect(doc?.registeredAt).toEqual(expect.any(Number));
    expect(doc?.registeredAt).toBe(doc?.derivedRegistration?.registeredAt);
  });

  it.each(["updateRegisteredDraft", "updateForReview"] as const)(
    "%s は既存の登録日時を保持し、フィールド未設定の登録済み下書きにも同じ値を書く",
    async (mutation) => {
      const t = convexTest(schema, convexTestModules);
      const { groupId, categoryId } = await seedGroup(t);
      const draftId = await t.run(async (ctx) => {
        const draftId = await ctx.db.insert(
          "aiExpenseDrafts",
          draftSeed(groupId, {
            status: "registered",
            shopName: "登録済み下書き",
            date: "2026-08-26",
            amountYen: 1200,
            categoryId,
            derivedRegistration: { ...derivedSeed(categoryId, 1111), categoryIds: [categoryId] },
            createdAt: 100,
            updatedAt: 100,
          }),
        );
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: "食品",
          amountYen: 400,
          categoryId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 100,
          updatedAt: 100,
        });
        await ctx.db.insert("aiExpenseDraftItems", {
          groupId,
          draftId,
          itemName: "惣菜",
          amountYen: 800,
          categoryId,
          confidence: { itemName: 1, amountYen: 1, categoryId: 1 },
          createdAt: 101,
          updatedAt: 101,
        });
        return draftId;
      });

      const authed = t.withIdentity(identity);
      const base = {
        draftId,
        date: "2026-08-27",
        amountYen: 1200,
        categoryId,
        shopName: "登録済み下書き",
      };
      if (mutation === "updateRegisteredDraft") {
        await authed.mutation(api.aiExpenseDrafts.mutations.updateRegisteredDraft, {
          ...base,
          registrationMode: "detailed",
        });
      } else {
        await authed.mutation(api.aiExpenseDrafts.mutations.updateForReview, {
          ...base,
          documentType: "receipt",
        });
      }

      const doc = await t.run(async (ctx) => await ctx.db.get(draftId));
      expect(doc?.derivedRegistration?.registeredAt).toBe(1111);
      expect(doc?.registeredAt).toBe(1111);
    },
  );
});
