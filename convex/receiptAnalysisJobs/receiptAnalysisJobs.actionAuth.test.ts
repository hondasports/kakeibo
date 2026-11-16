// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { convexTestModules } from "../test.setup";
import { VALID_IMAGE_DATA_URL } from "./testHelpers";

describe("analyzeImageJob の認証", () => {
  it("未認証ユーザーは実行できず、job は queued のまま残る", async () => {
    const t = convexTest(schema, convexTestModules);
    const jobId = await t.run(async (ctx) => {
      const groupId = await ctx.db.insert("groups", {
        name: "未認証確認グループ",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const batchId = await ctx.db.insert("receiptAnalysisBatches", {
        groupId,
        totalCount: 1,
        processedCount: 0,
        status: "running",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("receiptAnalysisImageJobs", {
        batchId,
        groupId,
        imageIndex: 0,
        fileName: "receipt.jpg",
        status: "queued",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t.action(api.receiptAnalysisJobs.actions.analyzeImageJob, {
        jobId,
        imageDataUrl: VALID_IMAGE_DATA_URL,
      }),
    ).rejects.toMatchObject({ data: "Not authenticated" });

    const job = await t.run(async (ctx) => await ctx.db.get(jobId));
    expect(job?.status).toBe("queued");
  });
});
