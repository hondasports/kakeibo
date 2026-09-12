import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { DraftReviewItemInput } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftDocumentType } from "../../domain/aiExpenseDrafts/constants";
import { classifyAiExpenseDraft } from "../../domain/aiExpenseDrafts/classification";
import { buildDerivedRegistration } from "../../domain/aiExpenseDrafts/registration";
import {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import {
  buildReviewConfidence,
  getReviewUpdateReadyErrorMessage,
  resolveReviewRegistrationMode,
  validateReviewUpdateCanBecomeReady,
} from "../../domain/aiExpenseDrafts/review";
import { nonTaxReviewReasons } from "../../domain/aiExpenseDrafts/reviewReasons";
import { validatePositiveCategoryTotals } from "../../domain/aiExpenseDrafts/reviewItems";
import { trimOptional } from "../../domain/common/string";
import { resolveReceiptTotal } from "../../domain/receipt/tax/resolveReceiptTotal";
import type { PriceTaxTreatment, TaxRateComposition } from "../../domain/receipt/tax/types";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";
import { assertActiveCategoryForDraft } from "./assertActiveCategoryForDraft";

const REVIEW_OVERRIDE_FIELDS = [
  "documentType",
  "shopName",
  "paymentPlace",
  "payeeName",
  "paymentPurpose",
  "date",
  "amountYen",
  "registrationMode",
  "categoryId",
] as const;

const LIST_LIMIT = 100;

export type UpdateForReviewUsecaseArgs = {
  draftId: string;
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date: string;
  amountYen: number;
  registrationMode?: AiExpenseRegistrationMode;
  priceTaxTreatment?: PriceTaxTreatment;
  taxRateComposition?: TaxRateComposition;
  categoryId: string;
  items?: DraftReviewItemInput[];
};

/**
 * AI 下書きのレビュー内容を保存する。
 * 税解釈がある場合は再計算を永続化し、registered 済みなら支出エントリへリコンサイルする。
 */
export async function updateAiExpenseDraftForReview(
  ctx: UsecaseGroupContext,
  deps: Pick<
    AiExpenseDraftDeps,
    | "drafts"
    | "draftItems"
    | "categories"
    | "taxInterpretation"
    | "overrideSnapshots"
    | "itemReplace"
    | "expenseEntryReconcile"
  >,
  args: UpdateForReviewUsecaseArgs,
): Promise<AiExpenseDraftFields> {
  const fields = await deps.drafts.findById(args.draftId);
  if (fields === null) {
    throw new ConvexError("AI expense draft not found");
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  if (!draft.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("AI expense draft does not belong to the current group");
  }
  const wasRegistered = draft.isRegistered();
  const registrationMode = resolveReviewRegistrationMode(args, fields);
  try {
    draft.assertReviewableFromQueue();
  } catch (err) {
    throw toConvexError(err);
  }

  await assertActiveCategoryForDraft(deps.categories, args.categoryId, ctx.groupId);
  const readyCheck = validateReviewUpdateCanBecomeReady(args);
  if (!readyCheck.success) {
    throw new ConvexError(getReviewUpdateReadyErrorMessage(readyCheck.error, args.documentType));
  }

  const now = Date.now();
  if (args.items !== undefined) {
    if (registrationMode === "detailed" && !validatePositiveCategoryTotals(args.items)) {
      throw new ConvexError("Draft category total must be greater than zero");
    }
    await deps.itemReplace.replaceForReview(args.draftId, ctx.groupId, args.items, now);
  }

  const reviewConfidence = buildReviewConfidence(fields.confidence, {
    shopName: args.shopName,
    paymentPlace: args.paymentPlace,
    payeeName: args.payeeName,
    paymentPurpose: args.paymentPurpose,
  });

  const classification = classifyAiExpenseDraft({
    documentType: args.documentType,
    shopName: trimOptional(args.shopName),
    paymentPlace: trimOptional(args.paymentPlace),
    payeeName: trimOptional(args.payeeName) ?? trimOptional(args.shopName),
    paymentPurpose: trimOptional(args.paymentPurpose) ?? trimOptional(args.shopName),
    date: trimOptional(args.date),
    amountYen: args.amountYen,
    categoryId: args.categoryId,
    confidence: reviewConfidence,
    warnings: [],
    multiCategoryConfirmed: true,
    items:
      registrationMode === "detailed"
        ? args.items?.map((item) => ({
            itemName: item.itemName,
            amountYen: item.amountYen,
            categoryId: item.categoryId,
          }))
        : undefined,
  });

  await deps.drafts.patch(args.draftId, {
    documentType: args.documentType,
    shopName: trimOptional(args.shopName),
    paymentPlace: trimOptional(args.paymentPlace),
    payeeName: trimOptional(args.payeeName),
    paymentPurpose: trimOptional(args.paymentPurpose),
    date: trimOptional(args.date),
    amountYen: args.amountYen,
    registrationMode,
    categoryId: args.categoryId,
    confidence: reviewConfidence,
    updatedAt: now,
  });

  const hasTaxDecisionUpdate =
    args.priceTaxTreatment !== undefined || args.taxRateComposition !== undefined;
  if (
    (fields.taxSummaries && fields.taxSummaries.length > 0) ||
    args.priceTaxTreatment !== undefined ||
    args.taxRateComposition !== undefined
  ) {
    await deps.taxInterpretation.persistInterpretation({
      draftId: args.draftId,
      groupId: ctx.groupId,
      receiptTotalSource: "user_confirmed",
      decisionOverride: hasTaxDecisionUpdate
        ? {
            priceTaxTreatment: args.priceTaxTreatment,
            taxRateComposition: args.taxRateComposition,
          }
        : undefined,
      preservedNonTaxReasons: nonTaxReviewReasons(classification.reviewReasons),
    });
    const updated = await deps.overrideSnapshots.persist({
      draftId: args.draftId,
      groupId: ctx.groupId,
      fields: [
        ...REVIEW_OVERRIDE_FIELDS,
        "receiptTotalResolution",
        ...(hasTaxDecisionUpdate ? ["receiptTaxDecision", "taxSummaries"] : []),
        ...(args.items === undefined ? [] : ["items"]),
      ],
      updatedAt: now,
    });
    return await reconcileRegisteredDraft(updated);
  }

  await deps.drafts.patch(args.draftId, {
    status: classification.status,
    receiptTotalResolution: resolveReceiptTotal({
      amountYen: args.amountYen,
      source: "user_confirmed",
      confidence: reviewConfidence.amountYen,
      supportingCandidates: fields.receiptTotalResolution?.candidates.filter(
        (candidate) => candidate.source !== "user_confirmed",
      ),
      taxSummaries: [],
    }),
    reviewReasons: classification.reviewReasons,
    updatedAt: now,
  });

  const updated = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: [
      ...REVIEW_OVERRIDE_FIELDS,
      "receiptTotalResolution",
      ...(args.items === undefined ? [] : ["items"]),
    ],
    updatedAt: now,
  });
  return await reconcileRegisteredDraft(updated);

  async function reconcileRegisteredDraft(
    updatedDraft: AiExpenseDraftFields,
  ): Promise<AiExpenseDraftFields> {
    if (!wasRegistered) {
      return updatedDraft;
    }
    const updatedItems = await deps.draftItems.listByDraftAsc(
      ctx.groupId,
      args.draftId,
      LIST_LIMIT,
    );
    let registrationItems;
    try {
      registrationItems = buildDraftRegistrationItems(updatedDraft, updatedItems);
    } catch (err) {
      throw toConvexError(err);
    }
    await deps.expenseEntryReconcile.reconcile({
      draft: updatedDraft,
      groupId: ctx.groupId,
      userId: ctx.userId,
      items: registrationItems,
      now,
    });
    await deps.drafts.patch(args.draftId, {
      status: "registered",
      derivedRegistration: buildDerivedRegistration({
        destination: "expense_entries",
        registrationMode: resolveRegistrationMode(updatedDraft),
        amountYen: updatedDraft.amountYen!,
        date: updatedDraft.date!,
        categoryIds: [...new Set(registrationItems.map((item) => item.categoryId))],
        registeredAt: updatedDraft.derivedRegistration?.registeredAt ?? now,
      }),
      updatedAt: now,
    });
    const reconciled = await deps.drafts.findById(args.draftId);
    if (reconciled === null) {
      throw new ConvexError("AI expense draft not found after registered update");
    }
    return reconciled;
  }
}
