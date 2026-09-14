/**
 * UserStore の Convex 実装。
 * endpoint が発行していた ctx.db 呼出形状をここに隔離する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { NewUserFields, UserPatch, UserRecord, UserStore } from "../../domain/users/store";

export function docToUserRecord(doc: Doc<"users">): UserRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    userId: doc.userId,
    displayName: doc.displayName,
    email: doc.email,
    activeGroupId: doc.activeGroupId,
    monthlyIncome: doc.monthlyIncome,
    weeklyStartDay: doc.weeklyStartDay,
    weeklyEndDay: doc.weeklyEndDay,
    receiptImageExternalApiConsentAcceptedAt: doc.receiptImageExternalApiConsentAcceptedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** query 側でも使える読み取り専用メソッド。 */
export type UserReader = Pick<UserStore, "findByUserId" | "findByEmail">;

export function createUserReader(ctx: Pick<QueryCtx, "db">): UserReader {
  return {
    async findByUserId(userId) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) => q.eq("userId", userId))
        .unique();
      return doc === null ? null : docToUserRecord(doc);
    },

    async findByEmail(email) {
      const doc = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      return doc === null ? null : docToUserRecord(doc);
    },
  };
}

export function createUserStore(ctx: Pick<MutationCtx, "db">): UserStore {
  return {
    ...createUserReader(ctx),

    async insert(fields: NewUserFields) {
      return await ctx.db.insert("users", fields);
    },

    async patch(id, patch: UserPatch) {
      await ctx.db.patch(id as Id<"users">, patch);
    },
  };
}
