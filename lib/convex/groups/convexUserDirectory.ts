/**
 * UserDirectory の Convex 実装。
 * クエリ読み出しは既存の groupQueryHelpers 経由（テストモック互換のため）。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { GroupUserRecord } from "../../domain/groups/groupUser";
import type { UserDirectory, UserDirectoryRead } from "../../domain/groups/userDirectory";
import { readQueryDoc } from "../../../convex/groups/lib/groupQueryHelpers";

function userDocToRecord(doc: Doc<"users">): GroupUserRecord {
  return {
    docId: doc._id,
    userId: doc.userId,
    displayName: doc.displayName,
    email: doc.email,
    activeGroupId: doc.activeGroupId,
  };
}

function userDirectoryRead(ctx: Pick<QueryCtx, "db">): UserDirectoryRead {
  return {
    async findByUserId(userId) {
      const doc = await readQueryDoc(
        ctx.db.query("users").withIndex("by_token_identifier", (q) => q.eq("userId", userId)),
      );
      return doc === null ? null : userDocToRecord(doc);
    },
    async findByEmail(email) {
      const doc = await readQueryDoc(
        ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)),
      );
      return doc === null ? null : userDocToRecord(doc);
    },
  };
}

export function createUserDirectory(ctx: Pick<MutationCtx, "db">): UserDirectory {
  return {
    ...userDirectoryRead(ctx),
    async setActiveGroup(docId, groupId, updatedAt) {
      await ctx.db.patch(docId as Id<"users">, {
        activeGroupId: groupId === undefined ? undefined : (groupId as Id<"groups">),
        updatedAt,
      });
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createUserDirectoryRead(ctx: Pick<QueryCtx, "db">): UserDirectoryRead {
  return userDirectoryRead(ctx);
}
