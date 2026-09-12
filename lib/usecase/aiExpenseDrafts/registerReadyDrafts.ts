import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import {
  buildDerivedRegistration,
  dedupeDraftIds,
  getReadyDraftRegistrationErrorMessage,
  isAlreadyRegisteredAsReceipt,
  validateReadyDraftForRegistration,
} from "../../domain/aiExpenseDrafts/registration";
import {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";
import { resolveReceiptShopNameFromDraft } from "../../domain/aiExpenseDrafts/shopName";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";

export type RegisterReadyDraftsResult = {
  registeredDraftIds: string[];
  registeredReceiptIds: string[];
  alreadyRegisteredDraftIds: string[];
};

/** ready 状態の下書きを receipts へ登録する。 */
export async function registerReadyDrafts(
  ctx: UsecaseGroupContext,
  deps: Pick<AiExpenseDraftDeps, "drafts" | "draftItems" | "receiptInsert">,
  args: { draftIds: string[] },
): Promise<RegisterReadyDraftsResult> {
  const uniqueDraftIds = dedupeDraftIds(args.draftIds);
  if (uniqueDraftIds.length === 0) {
    return {
      registeredDraftIds: [],
      registeredReceiptIds: [],
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
    if (isAlreadyRegisteredAsReceipt(fields)) {
      alreadyRegisteredDraftIds.push(fields.id!);
      continue;
    }
    const result = validateReadyDraftForRegistration(fields);
    if (!result.success) {
      throw new ConvexError(getReadyDraftRegistrationErrorMessage(result.error));
    }
    draftsToRegister.push(fields);
  }

  const registeredReceiptIds: string[] = [];

  for (const draft of draftsToRegister) {
    // totalOnly の場合は確認済み合計であることを同じ契約で検証する。
    const items =
      resolveRegistrationMode(draft) !== "totalOnly"
        ? await deps.draftItems.listAllByDraft(ctx.groupId, draft.id!)
        : [];
    try {
      buildDraftRegistrationItems(draft, items);
    } catch (err) {
      throw toConvexError(err);
    }
    const receiptId = await deps.receiptInsert.insert({
      groupId: ctx.groupId,
      userId: ctx.userId,
      fields: {
        type: "expense",
        date: draft.date!,
        shopName: resolveReceiptShopNameFromDraft(draft),
        amountYen: draft.amountYen!,
        categoryId: draft.categoryId!,
      },
    });
    registeredReceiptIds.push(receiptId);
  }

  const now = Date.now();
  await Promise.all(
    draftsToRegister.map((draft, index) =>
      deps.drafts.patch(draft.id!, {
        status: "registered",
        registeredReceiptId: registeredReceiptIds[index],
        derivedRegistration: buildDerivedRegistration({
          destination: "receipt",
          registrationMode: resolveRegistrationMode(draft),
          amountYen: draft.amountYen!,
          date: draft.date!,
          categoryIds: [draft.categoryId!],
          registeredAt: now,
        }),
        updatedAt: now,
      }),
    ),
  );

  return {
    registeredDraftIds: draftsToRegister.map((draft) => draft.id!),
    registeredReceiptIds,
    alreadyRegisteredDraftIds,
  };
}
