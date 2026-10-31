import { describe, expect, it, vi } from "vitest";
import type { QueryCtx } from "../../../convex/_generated/server";
import {
  createReceiptAnalysisReader,
  createReceiptAnalysisStore,
} from "./convexReceiptAnalysisStore";

describe.each([createReceiptAnalysisReader, createReceiptAnalysisStore])(
  "解析中ジョブのindex範囲",
  (createStore) => {
    it("groupId と queued / running をindexで指定し、完了ジョブの範囲を読まない", async () => {
      const ranges: Array<{ index: string; fields: unknown[][] }> = [];
      const query = vi.fn(() => ({
        withIndex: (index: string, range: (q: unknown) => unknown) => {
          const fields: unknown[][] = [];
          const q = {
            eq: (...args: unknown[]) => {
              fields.push(args);
              return q;
            },
          };
          range(q);
          ranges.push({ index, fields });
          const result = {
            take: vi.fn().mockResolvedValue([]),
            collect: vi.fn().mockResolvedValue([]),
          };
          return { ...result, order: () => result };
        },
      }));
      const store = createStore({ db: { query } } as unknown as QueryCtx);
      await store.listActiveJobsByGroup("group-1", 100);
      expect(ranges).toEqual([
        {
          index: "by_group_id_and_status",
          fields: [
            ["groupId", "group-1"],
            ["status", "queued"],
          ],
        },
        {
          index: "by_group_id_and_status",
          fields: [
            ["groupId", "group-1"],
            ["status", "running"],
          ],
        },
      ]);
    });

    it("stale 検索は by_status_and_updated_at index で絞り、件数上限を付ける", async () => {
      const calls: Array<{ index: string; ops: unknown[][] }> = [];
      const taken: number[] = [];
      const query = vi.fn(() => ({
        withIndex: (index: string, range: (q: unknown) => unknown) => {
          const ops: unknown[][] = [];
          const q = {
            eq: (...args: unknown[]) => {
              ops.push(["eq", ...args]);
              return q;
            },
            lt: (...args: unknown[]) => {
              ops.push(["lt", ...args]);
              return q;
            },
          };
          range(q);
          calls.push({ index, ops });
          return {
            take: vi.fn(async (limit: number) => {
              taken.push(limit);
              return [];
            }),
          };
        },
      }));
      const store = createStore({ db: { query } } as unknown as QueryCtx);
      await store.listJobsByStatusUpdatedBefore("running", 12345, 100);
      expect(calls).toEqual([
        {
          index: "by_status_and_updated_at",
          ops: [
            ["eq", "status", "running"],
            ["lt", "updatedAt", 12345],
          ],
        },
      ]);
      expect(taken).toEqual([100]);
    });
  },
);

describe("失敗 draft の作成", () => {
  it("insertFailedAnalysisDraft は通常の解析失敗と同じ内容の draft を作成して id を返す", async () => {
    const inserted: Array<{ table: string; fields: Record<string, unknown> }> = [];
    const ctx = {
      db: {
        insert: vi.fn(async (table: string, fields: Record<string, unknown>) => {
          inserted.push({ table, fields });
          return "draft-new";
        }),
        get: vi.fn(async () => ({ _id: "draft-new", status: "failed" })),
      },
    } as unknown as QueryCtx;
    const store = createReceiptAnalysisStore(ctx);

    const id = await store.insertFailedAnalysisDraft({
      groupId: "group-1",
      createdByUserId: "user-1",
      imageFileName: "receipt.png",
      warning: "解析が完了しませんでした。もう一度お試しください",
    });

    expect(id).toBe("draft-new");
    expect(inserted).toEqual([
      {
        table: "aiExpenseDrafts",
        fields: expect.objectContaining({
          groupId: "group-1",
          createdByUserId: "user-1",
          sourceType: "image_upload",
          status: "failed",
          documentType: "unknown",
          imageFileName: "receipt.png",
          warnings: ["解析が完了しませんでした。もう一度お試しください"],
          reviewReasons: ["parse_failed"],
        }),
      },
    ]);
  });
});
