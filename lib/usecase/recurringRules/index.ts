import { ConvexError } from "convex/values";
import { getTodayDateStringInJapan } from "../../domain/common/date";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { SourceDocumentRepository } from "../../domain/sourceDocuments/sourceDocumentRepository";
import {
  isOccurrenceRegistered,
  isRuleDue,
  latestOccurrenceDate,
  MAX_REGISTERED_DATES,
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

/** 省略可能フィールドの正規化。収入ではカテゴリ・店名・メモを持たないため消去し、
    空文字は未指定（フィールド削除）に揃える。 */
function normalizedRuleFields(input: RecurringRuleInput): RecurringRuleInput {
  const trimmedShopName = input.shopName?.trim();
  const trimmedMemo = input.memo?.trim();
  return {
    ...input,
    categoryId: input.kind === "expense" ? input.categoryId : undefined,
    shopName: input.kind === "expense" && trimmedShopName ? trimmedShopName : undefined,
    memo: input.kind === "expense" && trimmedMemo ? trimmedMemo : undefined,
  };
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
    ...normalizedRuleFields(args),
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
  // 繰り返し条件が変わると発生日も変わるが、過去の発生日を遡って再登録しないため
  // 登録済み発生日の履歴は保持する。
  // 省略可能フィールドは常にキーを出して「未指定＝消去」に揃える
  // （キー自体が無いと db.patch が既存値を残してしまう）。
  await deps.recurringRules.update(ruleId, {
    ...normalizedRuleFields(patch),
    updatedAt: Date.now(),
  });
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
 * 1件作成する。二重登録は発生日ではなく期間キー（monthlyは月、
 * weeklyは週）で判定するため、条件変更で発生日が移動しても
 * 同じ期間には1回しか登録できない。
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
  if (isOccurrenceRegistered(rule, occurrence)) {
    return { registered: false, reason: "already_registered" };
  }
  if (rule.kind === "income") {
    // 収入エントリは title が「内容・メモ」兼用で memo フィールドを持たない
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
  const registeredForDates = [...(rule.registeredForDates ?? []), occurrence].slice(
    -MAX_REGISTERED_DATES,
  );
  await deps.recurringRules.update(ruleId, {
    registeredForDates,
    updatedAt: Date.now(),
  });
  return { registered: true, date: occurrence };
}

export { isRuleDue, latestOccurrenceDate };
