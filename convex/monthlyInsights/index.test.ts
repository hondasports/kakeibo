// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import {
  releaseMonthlyInsightGenerationHandler,
  reserveMonthlyInsightGenerationHandler,
} from "./index";

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

  it("24時間以内の保存済みレコードには予約せず cached を返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    // 予約なしで保存済み（actionのTTLチェック後・reserve前に別経路で保存された競合相当）
    await t.run(async (ctx) => {
      await ctx.db.insert("monthlyInsights", {
        groupId,
        month: "2026-11",
        commentText: "保存済みコメント",
        source: "ai",
        generatedAt: Date.now() - 60_000,
        generationCount: 1,
      });
    });

    expect(await reserve(t, groupId)).toBe("cached");
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row?.generationCount).toBe(1);
    expect(row?.generatingUntil).toBeUndefined();
  });
});

describe("releaseMonthlyInsightGeneration", () => {
  const release = (t: ReturnType<typeof convexTest>, groupId: Id<"groups">, month = "2026-11") =>
    t.run((ctx) => releaseMonthlyInsightGenerationHandler(ctx as MutationCtx, { groupId, month }));

  it("保存済みレコードの予約を解放し、generationCount を戻す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("monthlyInsights", {
        groupId,
        month: "2026-11",
        commentText: "保存済みコメント",
        source: "ai",
        generatedAt: Date.now() - 100_000_000,
        generationCount: 3,
        generatingUntil: Date.now() + 60_000,
      });
    });

    await release(t, groupId);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row?.generationCount).toBe(2);
    expect(row?.generatingUntil).toBeUndefined();
  });

  it("空の予約レコードは行ごと削除する", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    expect(await reserve(t, groupId)).toBe("reserved");

    await release(t, groupId);
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) => q.eq("groupId", groupId).eq("month", "2026-11"))
        .unique(),
    );
    expect(row).toBeNull();
  });

  it("解放後は同じ回数で再予約できる（失敗が上限を消費しない）", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedGroup(t);
    expect(await reserve(t, groupId)).toBe("reserved");
    await release(t, groupId);
    expect(await reserve(t, groupId)).toBe("reserved");
  });
});

describe("generateMonthlyInsight action", () => {
  const userId = "insight-user";
  const identity = () => ({
    tokenIdentifier: userId,
    subject: `clerk-${userId}`,
    issuer: "https://issuer.example",
  });

  async function seedMembership(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "インサイトグループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("users", {
        userId,
        displayName: "インサイトユーザー",
        createdAt: 1,
        updatedAt: 1,
        activeGroupId: groupId,
      });
      await ctx.db.insert("groupMembers", {
        groupId,
        userId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
      return groupId;
    });
  }

  it("24時間以内の保存済みコメントは OpenAI を呼ばず cached で返す", async () => {
    const t = convexTest(schema, convexTestModules);
    const groupId = await seedMembership(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("monthlyInsights", {
        groupId,
        month: "2026-10",
        commentText: "保存済みの傾向コメント",
        source: "ai",
        generatedAt: Date.now() - 60_000,
        generationCount: 1,
      });
    });
    // production想定にしても外部APIを呼ばないことを fetch で検証する
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.APP_ENV = "production";
    process.env.OPENAI_API_KEY = "test-key";

    const result = await t
      .withIdentity(identity())
      .action(api.monthlyInsights.index.generateMonthlyInsight, { month: "2026-10" });

    expect(result).toMatchObject({
      commentText: "保存済みの傾向コメント",
      source: "ai",
      cached: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    delete process.env.APP_ENV;
    delete process.env.OPENAI_API_KEY;
  });

  it("不正な月形式と未来月は拒否する", async () => {
    const t = convexTest(schema, convexTestModules);
    await seedMembership(t);

    await expect(
      t.withIdentity(identity()).action(api.monthlyInsights.index.generateMonthlyInsight, {
        month: "2026-13",
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(identity()).action(api.monthlyInsights.index.generateMonthlyInsight, {
        month: "2999-12",
      }),
    ).rejects.toThrow();
  });

  it("グループ未所属のユーザーは生成も参照もできない", async () => {
    const t = convexTest(schema, convexTestModules);
    // membership を張らない

    await expect(
      t.withIdentity(identity()).action(api.monthlyInsights.index.generateMonthlyInsight, {
        month: "2026-10",
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(identity()).query(api.monthlyInsights.index.getMonthlyInsight, {
        month: "2026-10",
      }),
    ).rejects.toThrow();
  });
});
