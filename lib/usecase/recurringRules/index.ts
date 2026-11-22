import { ConvexError } from "convex/values";
import { getTodayDateStringInJapan } from "../../domain/common/date";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { SourceDocumentRepository } from "../../domain/sourceDocuments/sourceDocumentRepository";
import {
  isRuleDue,
  latestOccurrenceDate,
  validateRecurringRuleInput,
  type RecurringRuleInput,
} from "../../domain/recurringRules/recurringRule";
import type {
  RecurringRuleRecord,
  RecurringRuleRepository,
} from "../../domain/recurringRules/recurringRuleRepository";
import type { UsecaseGroupContext } from "../context";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import { createExpenseEntries } from "../expenseEntries/createExpenseEntries";
import { createIncomeEntry } from "../expenseEntries/createIncomeEntry";

type Deps = {
  recurringRules: RecurringRuleRepository;
};

type RegisterDeps = Deps & {
  expenseEntries: ExpenseEntryRepository;
  sourceDocuments: SourceDocumentRepository;
  categories: CategoryRepository;
};

export async function listRecurringRules(
  ctx: UsecaseGroupContext,
  deps: Deps,
): Promise<RecurringRuleRecord[]> {
  return await deps.recurringRules.listByGroup(ctx.groupId);
}

async function requireGroupRule(
  ctx: UsecaseGroupContext,
  deps: Deps,
  ruleId: string,
): Promise<RecurringRuleRecord> {
  const rule = await deps.recurringRules.findById(ruleId);
  if (rule === null || rule.groupId !== ctx.groupId) {
    throw new ConvexError("Recurring rule not found");
  }
  return rule;
}

export async function createRecurringRule(
  ctx: UsecaseGroupContext,
  deps: Deps & { categories: CategoryRepository },
  args: RecurringRuleInput,
): Promise<string> {
  const result = validateRecurringRuleInput(args);
  if (!result.success) {
    throw new ConvexError(result.message);
  }
  if (args.kind === "expense" && args.categoryId !== undefined) {
    await assertUsableCategory(deps.categories, args.categoryId, ctx.groupId);
  }
  const now = Date.now();
  return await deps.recurringRules.insert({
    ...args,
    title: args.title.trim(),
    groupId: ctx.groupId,
    createdByUserId: ctx.userId,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateRecurringRule(
  ctx: UsecaseGroupContext,
  deps: Deps & { categories: CategoryRepository },
  ruleId: string,
  patch: RecurringRuleInput,
): Promise<void> {
  await requireGroupRule(ctx, deps, ruleId);
  const result = validateRecurringRuleInput(patch);
  if (!result.success) {
    throw new ConvexError(result.message);
  }
  if (patch.kind === "expense" && patch.categoryId !== undefined) {
    await assertUsableCategory(deps.categories, patch.categoryId, ctx.groupId);
  }
  // 繰り返し条件が変わると発生日も変わるため、登録済みマーカーは保持する
  // （過去の発生日を遡って再登録はしない）。
  await deps.recurringRules.update(ruleId, { ...patch, updatedAt: Date.now() });
}

export async function setRecurringRuleActive(
  ctx: UsecaseGroupContext,
  deps: Deps,
  ruleId: string,
  active: boolean,
): Promise<void> {
  await requireGroupRule(ctx, deps, ruleId);
  await deps.recurringRules.update(ruleId, { active, updatedAt: Date.now() });
}

export type RegisterFromRuleResult =
  | { registered: true; date: string }
  | { registered: false; reason: "inactive" | "already_registered" };

/**
 * 定期定義から実績を登録する。直近の発生日（JST基準・当日含む）で
 * 1件作成し、同じ発生日の二重登録は lastRegisteredFor で弾く。
 */
export async function registerFromRecurringRule(
  ctx: UsecaseGroupContext,
  deps: RegisterDeps,
  ruleId: string,
): Promise<RegisterFromRuleResult> {
  const rule = await requireGroupRule(ctx, deps, ruleId);
  if (!rule.active) {
    return { registered: false, reason: "inactive" };
  }
  const today = getTodayDateStringInJapan();
  const occurrence = latestOccurrenceDate(rule, today);
  if (rule.lastRegisteredFor === occurrence) {
    return { registered: false, reason: "already_registered" };
  }
  if (rule.kind === "income") {
    await createIncomeEntry(
      ctx,
      { expenseEntries: deps.expenseEntries },
      { date: occurrence, amountYen: rule.amountYen, title: rule.title },
    );
  } else {
    if (rule.categoryId === undefined) {
      throw new ConvexError("Recurring rule has no category");
    }
    await createExpenseEntries(
      ctx,
      {
        expenseEntries: deps.expenseEntries,
        sourceDocuments: deps.sourceDocuments,
        categories: deps.categories,
      },
      {
        date: occurrence,
        shopName: rule.shopName,
        sourceAmountYen: rule.shopName ? rule.amountYen : undefined,
        items: [
          {
            categoryId: rule.categoryId,
            amountYen: rule.amountYen,
            title: rule.title,
            memo: rule.memo,
          },
        ],
      },
    );
  }
  await deps.recurringRules.update(ruleId, {
    lastRegisteredFor: occurrence,
    updatedAt: Date.now(),
  });
  return { registered: true, date: occurrence };
}

export { isRuleDue, latestOccurrenceDate };
