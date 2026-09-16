import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { EmailSuppressionRecord } from "../../domain/email/records";
import type { EmailSuppressionStore } from "../../domain/email/store";

export const getEmailSuppressionDocByNormalizedEmail = (
  ctx: Pick<QueryCtx, "db">,
  normalizedEmail: string,
) =>
  ctx.db
    .query("emailSuppressions")
    .withIndex("by_normalized_email", (q) => q.eq("normalizedEmail", normalizedEmail))
    .unique();

export function toEmailSuppressionRecord(doc: Doc<"emailSuppressions">): EmailSuppressionRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    email: doc.email,
    normalizedEmail: doc.normalizedEmail,
    reason: doc.reason,
    ...(doc.source === undefined ? {} : { source: doc.source }),
    ...(doc.providerMessageId === undefined ? {} : { providerMessageId: doc.providerMessageId }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createEmailSuppressionReader(
  ctx: Pick<QueryCtx, "db">,
): Pick<EmailSuppressionStore, "findByNormalizedEmail" | "listByNormalizedEmail"> {
  return {
    async findByNormalizedEmail(normalizedEmail) {
      const doc = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_normalized_email", (q) => q.eq("normalizedEmail", normalizedEmail))
        .unique();
      return doc ? toEmailSuppressionRecord(doc) : null;
    },
    async listByNormalizedEmail(normalizedEmail) {
      const docs = await ctx.db
        .query("emailSuppressions")
        .withIndex("by_normalized_email", (q) => q.eq("normalizedEmail", normalizedEmail))
        .collect();
      return docs.map(toEmailSuppressionRecord);
    },
  };
}

export function createEmailSuppressionStore(ctx: Pick<MutationCtx, "db">): EmailSuppressionStore {
  return {
    ...createEmailSuppressionReader(ctx),
    async insertSuppression(fields) {
      return await ctx.db.insert("emailSuppressions", fields);
    },
    async updateSuppression(id, fields) {
      await ctx.db.patch(id as Id<"emailSuppressions">, fields);
    },
    async deleteSuppression(id) {
      await ctx.db.delete(id as Id<"emailSuppressions">);
    },
  };
}
