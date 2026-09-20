import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemReadRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import type {
  DraftOverrideSnapshotService,
  DraftTaxInterpretationService,
} from "../../domain/aiExpenseDrafts/draftWorkflowServices";
import type { AmountBasis, TaxRatePercent } from "../../domain/receipt/tax/types";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type UpdateDraftItemTaxOverridesUsecaseArgs = {
  draftId: string;
  itemId: string;
  taxRatePercent?: TaxRatePercent | null;
  amountBasis?: AmountBasis;
};

/** 明細単位の税オーバーライドを適用し、税解釈を再計算して永続化する。 */
export async function updateDraftItemTaxOverrides(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: {
    drafts: AiExpenseDraftReadRepository;
    draftItems: AiExpenseDraftItemReadRepository;
    taxInterpretation: DraftTaxInterpretationService;
    overrideSnapshots: DraftOverrideSnapshotService;
  },
  args: UpdateDraftItemTaxOverridesUsecaseArgs,
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] }> {
  // 税内訳が無い下書きでも明細単位の補正は受け付ける。金額・サマリ欠落の判定は
  // persistInterpretation 内の validateTaxInterpretationEligibility に委譲する。
  await loadEditableDraft(deps, ctx.groupId, args.draftId);

  const items = await deps.draftItems.listByDraftAsc(ctx.groupId, args.draftId);
  const itemIndex = items.findIndex((item) => item.id === args.itemId);
  if (itemIndex < 0) {
    throw new ConvexError("AI expense draft item not found");
  }

  const result = await deps.taxInterpretation.persistInterpretation({
    draftId: args.draftId,
    groupId: ctx.groupId,
    override: {
      itemIndex,
      taxRatePercent: args.taxRatePercent,
      amountBasis: args.amountBasis,
    },
  });
  const updatedDraft = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: ["items", "receiptTotalResolution", "receiptTaxDecision"],
  });
  return { ...result, draft: updatedDraft };
}

/**
 * 税系ユースケース共通の読み込み＋編集可否ガード。
 * 存在しない→not found、他グループ→does not belong、registered→cannot be edited、
 * needs_review/ready 以外→cannot be edited。
 */
export async function loadEditableDraft(
  deps: { drafts: AiExpenseDraftReadRepository },
  groupId: string,
  draftId: string,
): Promise<AiExpenseDraft> {
  const fields = await deps.drafts.findById(draftId);
  if (fields === null) {
    throw new ConvexError("AI expense draft not found");
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  if (!draft.belongsToGroup(groupId)) {
    throw new ConvexError("AI expense draft does not belong to the current group");
  }
  try {
    draft.assertEditableFromQueue();
  } catch (err) {
    throw toConvexError(err);
  }
  return draft;
}
