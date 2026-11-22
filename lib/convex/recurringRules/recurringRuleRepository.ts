import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  RecurringRuleRecord,
  RecurringRuleRepository,
} from "../../domain/recurringRules/recurringRuleRepository";
import type { RecurringRule } from "../../domain/recurringRules/recurringRule";

type Ctx = Pick<MutationCtx, "db">;

function toRecord(doc: Doc<"recurringEntryRules">): RecurringRuleRecord {
  return {
    id: doc._id,
    groupId: doc.groupId,
    createdByUserId: doc.createdByUserId,
    kind: doc.kind,
    title: doc.title,
    amountYen: doc.amountYen,
    categoryId: doc.categoryId,
    shopName: doc.shopName,
    memo: doc.memo,
    frequency: doc.frequency,
    dayOfWeek: doc.dayOfWeek,
    dayOfMonth: doc.dayOfMonth,
    active: doc.active,
    lastRegisteredFor: doc.lastRegisteredFor,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function createRecurringRuleRepository(ctx: Ctx): RecurringRuleRepository {
  return {
    listByGroup: async (groupId) =>
      (
        await ctx.db
          .query("recurringEntryRules")
          .withIndex("by_group_id", (q) => q.eq("groupId", groupId as Id<"groups">))
          .collect()
      ).map(toRecord),
    findById: async (id) => {
      const doc = await ctx.db.get(id as Id<"recurringEntryRules">);
      return doc === null ? null : toRecord(doc);
    },
    insert: async (rule) =>
      await ctx.db.insert("recurringEntryRules", {
        groupId: rule.groupId as Id<"groups">,
        createdByUserId: rule.createdByUserId,
        kind: rule.kind,
        title: rule.title,
        amountYen: rule.amountYen,
        categoryId: rule.categoryId as Id<"categories"> | undefined,
        shopName: rule.shopName,
        memo: rule.memo,
        frequency: rule.frequency,
        dayOfWeek: rule.dayOfWeek,
        dayOfMonth: rule.dayOfMonth,
        active: rule.active,
        lastRegisteredFor: rule.lastRegisteredFor,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      }),
    update: async (id, patch: Partial<RecurringRule>) => {
      const docPatch: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        docPatch[key] = key === "categoryId" ? (value as Id<"categories">) : value;
      }
      await ctx.db.patch(id as Id<"recurringEntryRules">, docPatch);
    },
  };
}
