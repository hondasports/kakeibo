import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireGroupMembership } from "../groups/membership";
import { entryKindValidator } from "../../lib/convex/receipts/validators";
import { createRecurringRuleRepository } from "../../lib/convex/recurringRules/recurringRuleRepository";
import { createCategoryRepository } from "../../lib/convex/categories/categoryRepository";
import { createExpenseEntryRepository } from "../../lib/convex/expenseEntries/expenseEntryRepository";
import { createSourceDocumentRepository } from "../../lib/convex/sourceDocuments/sourceDocumentRepository";
import {
  createRecurringRule as createRecurringRuleUsecase,
  listRecurringRules as listRecurringRulesUsecase,
  registerFromRecurringRule as registerFromRecurringRuleUsecase,
  setRecurringRuleActive as setRecurringRuleActiveUsecase,
  updateRecurringRule as updateRecurringRuleUsecase,
} from "../../lib/usecase/recurringRules";

function groupCtx(args: { groupId: string; userId: string }) {
  return args;
}

export const listRecurringRules = query({
  args: {},
  handler: async (ctx): Promise<Doc<"recurringEntryRules">[]> => {
    const { groupId, userId } = await requireGroupMembership(ctx);
    const records = await listRecurringRulesUsecase(groupCtx({ groupId, userId }), {
      recurringRules: createRecurringRuleRepository(ctx as unknown as MutationCtx),
    });
    return await Promise.all(
      records.map(async (record) => (await ctx.db.get(record.id as Id<"recurringEntryRules">))!),
    );
  },
});

const ruleInputFields = {
  kind: entryKindValidator,
  title: v.string(),
  amountYen: v.number(),
  categoryId: v.optional(v.id("categories")),
  shopName: v.optional(v.string()),
  memo: v.optional(v.string()),
  frequency: v.union(v.literal("weekly"), v.literal("monthly")),
  dayOfWeek: v.optional(v.number()),
  dayOfMonth: v.optional(v.number()),
};

export const createRecurringRule = mutation({
  args: ruleInputFields,
  returns: v.id("recurringEntryRules"),
  handler: async (ctx: MutationCtx, args): Promise<Id<"recurringEntryRules">> => {
    const { groupId, userId } = await requireGroupMembership(ctx);
    return (await createRecurringRuleUsecase(
      groupCtx({ groupId, userId }),
      {
        recurringRules: createRecurringRuleRepository(ctx),
        categories: createCategoryRepository(ctx),
      },
      args,
    )) as Id<"recurringEntryRules">;
  },
});

export const updateRecurringRule = mutation({
  args: { ruleId: v.id("recurringEntryRules"), ...ruleInputFields },
  handler: async (ctx: MutationCtx, args): Promise<void> => {
    const { groupId, userId } = await requireGroupMembership(ctx);
    const { ruleId, ...patch } = args;
    await updateRecurringRuleUsecase(
      groupCtx({ groupId, userId }),
      {
        recurringRules: createRecurringRuleRepository(ctx),
        categories: createCategoryRepository(ctx),
      },
      ruleId,
      patch,
    );
  },
});

export const setRecurringRuleActive = mutation({
  args: { ruleId: v.id("recurringEntryRules"), active: v.boolean() },
  handler: async (ctx: MutationCtx, args): Promise<void> => {
    const { groupId, userId } = await requireGroupMembership(ctx);
    await setRecurringRuleActiveUsecase(
      groupCtx({ groupId, userId }),
      { recurringRules: createRecurringRuleRepository(ctx) },
      args.ruleId,
      args.active,
    );
  },
});

export const registerFromRecurringRule = mutation({
  args: { ruleId: v.id("recurringEntryRules") },
  handler: async (ctx: MutationCtx, args) => {
    const { groupId, userId } = await requireGroupMembership(ctx);
    return await registerFromRecurringRuleUsecase(
      groupCtx({ groupId, userId }),
      {
        recurringRules: createRecurringRuleRepository(ctx),
        expenseEntries: createExpenseEntryRepository(ctx),
        sourceDocuments: createSourceDocumentRepository(ctx),
        categories: createCategoryRepository(ctx),
      },
      args.ruleId,
    );
  },
});
