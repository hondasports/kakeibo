import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import {
  buildDerivedRegistration,
  dedupeDraftIds,
  getReadyDraftRegistrationErrorMessage,
  isAlreadyRegistered,
  validateReadyDraftForRegistration,
} from "../../domain/aiExpenseDrafts/registration";
import {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";

const LIST_LIMIT = 100;

export type RegisterReadyDraftsAsExpenseEntriesResult = {
  registeredDraftIds: string[];
  createdExpenseEntryIds: string[];
  alreadyRegisteredDraftIds: string[];
};

/** ready 状態の下書きを支出エントリへ登録する。 */
export async function registerReadyDraftsAsExpenseEntries(
  ctx: UsecaseGroupContext,
  deps: Pick<AiExpenseDraftDeps, "drafts" | "draftItems" | "expenseEntryReconcile">,
  args: { draftIds: string[] },
): Promise<RegisterReadyDraftsAsExpenseEntriesResult> {
  const uniqueDraftIds = dedupeDraftIds(args.draftIds);
  if (uniqueDraftIds.length === 0) {
    return {
      registeredDraftIds: [],
      createdExpenseEntryIds: [],
      alreadyRegisteredDraftIds: [],
    };
  }

  const drafts = await Promise.all(
    uniqueDraftIds.map(async (draftId) => {
      const fields = await deps.drafts.findById(draftId);
      if (fields === null) {
        throw new ConvexError("AI expense draft not found");
      }
      const draft = AiExpenseDraft.fromPersisted(fields);
      if (!draft.belongsToGroup(ctx.groupId)) {
        throw new ConvexError("AI expense draft does not belong to the current group");
      }
      return fields;
    }),
  );

  const draftsToRegister: AiExpenseDraftFields[] = [];
  const alreadyRegisteredDraftIds: string[] = [];

  for (const fields of drafts) {
    if (isAlreadyRegistered(fields)) {
      alreadyRegisteredDraftIds.push(fields.id!);
      continue;
    }
    const result = validateReadyDraftForRegistration(fields);
    if (!result.success) {
      throw new ConvexError(getReadyDraftRegistrationErrorMessage(result.error));
    }
    draftsToRegister.push(fields);
  }

  const createdExpenseEntryIds: string[] = [];
  const registeredCategoryIds = new Map<string, string[]>();

  for (const draft of draftsToRegister) {
    const items = await deps.draftItems.listByDraftAsc(ctx.groupId, draft.id!, LIST_LIMIT);

    let itemsToRegister;
    try {
      itemsToRegister = buildDraftRegistrationItems(draft, items);
    } catch (err) {
      throw toConvexError(err);
    }
    registeredCategoryIds.set(draft.id!, [
      ...new Set(itemsToRegister.map((item) => item.categoryId)),
    ]);

    const entryIds = await deps.expenseEntryReconcile.reconcile({
      draft,
      groupId: ctx.groupId,
      userId: ctx.userId,
      items: itemsToRegister,
      now: Date.now(),
    });
    createdExpenseEntryIds.push(...entryIds);
  }

  const now = Date.now();
  await Promise.all(
    draftsToRegister.map((draft) =>
      deps.drafts.patch(draft.id!, {
        status: "registered",
        derivedRegistration: buildDerivedRegistration({
          destination: "expense_entries",
          registrationMode: resolveRegistrationMode(draft),
          amountYen: draft.amountYen!,
          date: draft.date!,
          categoryIds: registeredCategoryIds.get(draft.id!) ?? [],
          registeredAt: now,
        }),
        updatedAt: now,
      }),
    ),
  );

  return {
    registeredDraftIds: draftsToRegister.map((draft) => draft.id!),
    createdExpenseEntryIds,
    alreadyRegisteredDraftIds,
  };
}
