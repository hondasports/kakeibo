/**
 * ReceiptRepository の Convex 実装。
 * domain 層の型（string ID）と Convex の Id<> の変換をここで吸収する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { ReceiptFields, ReceiptUpdatePatch } from "../../domain/receipt/receipt";
import type { ReceiptRepository } from "../../domain/receipt/receiptRepository";

function toFields(doc: Doc<"receipts">): ReceiptFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id };
}

export function createReceiptRepository(ctx: Pick<MutationCtx, "db">): ReceiptRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"receipts">);
      return doc === null ? null : toFields(doc);
    },
    async insert(fields) {
      return await ctx.db.insert("receipts", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
        categoryId: fields.categoryId as Id<"categories">,
      });
    },
    async patch(id, patch: ReceiptUpdatePatch & { updatedAt: number }) {
      await ctx.db.patch(id as Id<"receipts">, {
        ...patch,
        categoryId: patch.categoryId as Id<"categories"> | undefined,
      });
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"receipts">);
    },
  };
}
