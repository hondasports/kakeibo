import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../../../convex/_generated/server";
import { createAccountDeletionUserDataPurgeStore } from "./convexAccountDeletionPurgeStore";

type EqConstraint = readonly [field: string, value: unknown];
type EqBuilder = { eq: (field: string, value: unknown) => EqBuilder };

/**
 * index の前方一致を模倣する fake。build で積まれた eq 制約を記録し、
 * 全制約に合致する行だけを index 順（seed 順）で返す。
 */
function createIndexedDb(docs: Record<string, unknown>[]) {
  const calls: { indexName: string; constraints: EqConstraint[] }[] = [];
  const db = {
    query: vi.fn(() => ({
      withIndex: vi.fn((indexName: string, build: (q: EqBuilder) => EqBuilder) => {
        const constraints: EqConstraint[] = [];
        const builder: EqBuilder = {
          eq(field, value) {
            constraints.push([field, value]);
            return builder;
          },
        };
        build(builder);
        calls.push({ indexName, constraints });
        return {
          take: vi.fn(async (limit: number) =>
            docs
              .filter((doc) => constraints.every(([field, value]) => doc[field] === value))
              .slice(0, limit),
          ),
        };
      }),
    })),
    delete: vi.fn(async () => undefined),
  };
  return { db, calls };
}

describe("AccountDeletionUserDataPurgeStore.takeUserScopedIds", () => {
  it("lineAccountLinks は status を列挙せず userId の前方一致で全 status の行を削除対象にする", async () => {
    const userId = "user-1";
    const docs = [
      { _id: "link-active", userId, status: "active" },
      { _id: "link-revoked", userId, status: "revoked" },
      // schema に status が追加されても取り残さないことの確認用。
      { _id: "link-future", userId, status: "blocked" },
      { _id: "link-other-user", userId: "user-2", status: "active" },
    ];
    const { db, calls } = createIndexedDb(docs);
    const store = createAccountDeletionUserDataPurgeStore({ db } as unknown as Pick<
      MutationCtx,
      "db"
    >);

    const ids = await store.takeUserScopedIds("lineAccountLinks", userId, 10);

    expect(ids).toEqual(["link-active", "link-revoked", "link-future"]);
    expect(calls).toEqual([
      { indexName: "by_user_id_and_status", constraints: [["userId", userId]] },
    ]);
  });
});
