// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { convexTestModules } from "./test.setup";

async function seedGroup(t: ReturnType<typeof convexTest>): Promise<Id<"groups">> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("groups", {
        name: "backfill 対象グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      }),
  );
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

describe("aiExpenseDraftRegisteredAtMigration", () => {
  it("registeredAt 未設定の登録済み下書きを derivedRegistration / updatedAt で補完し、冪等に再実行できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    const ids = await t.run(async (ctx) => {
      const withDerived = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          derivedRegistration: {
            source: "derived",
            destination: "expense_entries",
            amountYen: 1200,
            date: "2026-08-26",
            categoryIds: [],
            registeredAt: 111,
          },
          createdAt: 1,
          updatedAt: 555,
        }),
      );
      const withoutDerived = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          createdAt: 2,
          updatedAt: 222,
        }),
      );
      const alreadySet = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "registered",
          registeredAt: 333,
          createdAt: 3,
          updatedAt: 444,
        }),
      );
      const notRegistered = await ctx.db.insert(
        "aiExpenseDrafts",
        draftSeed(groupId, {
          status: "ready",
          createdAt: 4,
          updatedAt: 4,
        }),
      );
      return { withDerived, withoutDerived, alreadySet, notRegistered };
    });

    const dryRun = await t.query(internal.aiExpenseDraftRegisteredAtMigration.dryRun, {});
    expect(dryRun).toMatchObject({ isDone: true, needsBackfill: 2, alreadyBackfilled: 1 });

    const result = await t.mutation(internal.aiExpenseDraftRegisteredAtMigration.executeBatch, {});
    expect(result).toMatchObject({ isDone: true, backfilled: 2, alreadyBackfilled: 1 });

    const docs = await t.run(async (ctx) => ({
      withDerived: await ctx.db.get(ids.withDerived),
      withoutDerived: await ctx.db.get(ids.withoutDerived),
      alreadySet: await ctx.db.get(ids.alreadySet),
      notRegistered: await ctx.db.get(ids.notRegistered),
    }));
    expect(docs.withDerived?.registeredAt).toBe(111);
    expect(docs.withoutDerived?.registeredAt).toBe(222);
    expect(docs.alreadySet?.registeredAt).toBe(333);
    expect(docs.notRegistered?.registeredAt).toBeUndefined();
    // backfill は登録日時だけを埋め、updatedAt を動かさない。
    expect(docs.withDerived?.updatedAt).toBe(555);

    expect(await t.query(internal.aiExpenseDraftRegisteredAtMigration.verify, {})).toMatchObject({
      isDone: true,
      remaining: 0,
    });

    const again = await t.mutation(internal.aiExpenseDraftRegisteredAtMigration.executeBatch, {});
    expect(again.backfilled).toBe(0);
  });

  it("バッチ上限ごとに cursor を返して継続する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 26; i += 1) {
        await ctx.db.insert(
          "aiExpenseDrafts",
          draftSeed(groupId, {
            status: "registered",
            createdAt: i,
            updatedAt: 1000 + i,
          }),
        );
      }
    });

    const first = await t.mutation(internal.aiExpenseDraftRegisteredAtMigration.executeBatch, {});
    expect(first.isDone).toBe(false);
    expect(first.backfilled).toBe(25);
    expect(first.continueCursor).not.toBeNull();

    const second = await t.mutation(internal.aiExpenseDraftRegisteredAtMigration.executeBatch, {
      cursor: first.continueCursor ?? undefined,
    });
    expect(second.isDone).toBe(true);
    expect(second.backfilled).toBe(1);

    const verify = await t.query(internal.aiExpenseDraftRegisteredAtMigration.verify, {});
    expect(verify.remaining).toBe(0);
  });
});
