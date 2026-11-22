// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { reserveMonthlyInsightGenerationHandler } from "./index";

async function seedGroup(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    return ctx.db.insert("groups", {
      name: "インサイトグループ",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

const reserve = (t: ReturnType<typeof convexTest>, groupId: Id<"groups">, month = "2026-11") =>
  t.run((ctx) => reserveMonthlyInsightGenerationHandler(ctx as MutationCtx, { groupId, month }));

describe("reserveMonthlyInsightGeneration", () => {
  it("初回の予約は generationCount=1・generatingUntil 付きでレコードを作る", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);

    expect(await reserve(t, groupId)).toBe("reserved");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row?.generationCount).toBe(1);
    expect(row?.generatingUntil).toBeGreaterThan(Date.now());
    // 保存前の予約は24hキャッシュの対象外にする（失敗後に再試行できるように）
    expect(row?.generatedAt).toBe(0);
  });

  it("予約中の並列呼び出しは in_progress を返し、生成に進むのは1件だけになる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);

    // mutation は直列化されるため、並列呼び出しでも2回目は必ずこの順序で拒否される。
    // 有料APIを呼ぶのは reserved を得た側だけ（= 並列でも呼出しは1回）。
    expect(await reserve(t, groupId)).toBe("reserved");
    expect(await reserve(t, groupId)).toBe("in_progress");
    expect(await reserve(t, groupId)).toBe("in_progress");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row?.generationCount).toBe(1);
  });

  it("予約が失効（generatingUntil 経過）すれば再生成を予約でき、回数が進む", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    expect(await reserve(t, groupId)).toBe("reserved");

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique();
      // 予約失効を再現（60秒経過後の呼び出し相当）
      await ctx.db.patch(row!._id, { generatingUntil: Date.now() - 1 });
    });

    expect(await reserve(t, groupId)).toBe("reserved");
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row?.generationCount).toBe(2);
  });

  it("再生成が3回に達すると limit を返す（初回を含め計4回で止まる）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    // 初回+再生成3回が消化済み（generationCount=4）・予約は失効済みの状態を再現
    await t.run(async (ctx) => {
      await ctx.db.insert("monthlyInsights", {
        groupId,
        month: "2026-11",
        commentText: "保存済み",
        source: "fallback",
        generatedAt: 1,
        generationCount: 4,
        generatingUntil: Date.now() - 1,
      });
    });

    expect(await reserve(t, groupId)).toBe("limit");
  });

  it("月が違えば別枠として予約できる", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);

    expect(await reserve(t, groupId, "2026-11")).toBe("reserved");
    expect(await reserve(t, groupId, "2026-10")).toBe("reserved");
  });
});
