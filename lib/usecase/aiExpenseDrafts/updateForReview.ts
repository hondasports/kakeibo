import { hasReceiptTaxMetadata } from "../../domain/receipt/tax/draftTaxMapping";
import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type {
  AiExpenseDraftItemFields,
  DraftReviewItemInput,
} from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { AiExpenseDraftDocumentType } from "../../domain/aiExpenseDrafts/constants";
import { classifyAiExpenseDraft } from "../../domain/aiExpenseDrafts/classification";
import {
  buildRegistrationPatchFields,
  resolveRegisteredAt,
} from "../../domain/aiExpenseDrafts/registration";
import {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";
import {
  RECEIPT_TAX_CHOICE_FIELDS,
  resolveReceiptTaxChoices,
  snapshotReceiptDraftValues,
  type AiExpenseRegistrationMode,
} from "../../domain/aiExpenseDrafts/receiptDataContract";
import {
  buildReviewConfidence,
  getReviewUpdateReadyErrorMessage,
  resolveReviewRegistrationMode,
  validateReviewUpdateCanBecomeReady,
} from "../../domain/aiExpenseDrafts/review";
import { nonTaxReviewReasons } from "../../domain/aiExpenseDrafts/reviewReasons";
import { validatePositiveCategoryTotals } from "../../domain/aiExpenseDrafts/reviewItems";
import { applyRecordPatch } from "../../domain/common/recordPatch";
import { trimOptional } from "../../domain/common/string";
import { resolveReceiptTotal } from "../../domain/receipt/tax/resolveReceiptTotal";
import type { PriceTaxTreatment, TaxRateComposition } from "../../domain/receipt/tax/types";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";
import { assertActiveCategoryForDraft } from "./assertActiveCategoryForDraft";
import { loadDraftInGroup } from "./loadDraftInGroup";

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
  const fields = await loadDraftInGroup(deps.drafts, ctx.groupId, args.draftId);
  const draft = AiExpenseDraft.fromPersisted(fields);
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

  const effectiveComposition =
    args.taxRateComposition ??
    (args.priceTaxTreatment === undefined
      ? resolveReceiptTaxChoices(fields).taxRateComposition
      : undefined);
  const globalRate =
    effectiveComposition === "rate8" ? 8 : effectiveComposition === "rate10" ? 10 : undefined;
  if (
    globalRate !== undefined &&
    args.items?.some(
      (item) => item.confirmedTaxRatePercent != null && item.confirmedTaxRatePercent !== globalRate,
    )
  ) {
    throw new ConvexError("Item tax rate confirmation conflicts with the receipt tax choice");
  }

  const now = Date.now();
  const hasTaxDecisionUpdate =
    args.priceTaxTreatment !== undefined || args.taxRateComposition !== undefined;
  const originalItems = await deps.draftItems.listByDraftAsc(ctx.groupId, args.draftId);
  const shouldReinterpretTax = hasTaxDecisionUpdate || hasReceiptTaxMetadata(fields, originalItems);
  // 読み込み済みの下書き・明細を引き回し、patch 内容をメモリ上で追跡して再読み込みを省く。
  let currentDraft = fields;
  if (!fields.receiptInterpretation && shouldReinterpretTax) {
    const legacyInterpretationPatch = {
      receiptInterpretation: {
        source: "legacy_projection" as const,
        interpretedAt: now,
        values: snapshotReceiptDraftValues(fields, originalItems),
      },
    };
    await deps.drafts.patch(args.draftId, legacyInterpretationPatch);
    currentDraft = applyRecordPatch(
      currentDraft as unknown as Record<string, unknown>,
      legacyInterpretationPatch,
    ) as unknown as AiExpenseDraftFields;
  }
  let currentItems = originalItems;
  if (args.items !== undefined) {
    if (registrationMode === "detailed" && !validatePositiveCategoryTotals(args.items)) {
      throw new ConvexError("Draft category total must be greater than zero");
    }
    currentItems = await deps.itemReplace.replaceForReview(
      args.draftId,
      ctx.groupId,
      args.items,
      now,
      originalItems,
    );
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

  const reviewFieldsPatch = {
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
  };
  await deps.drafts.patch(args.draftId, reviewFieldsPatch);
  currentDraft = applyRecordPatch(
    currentDraft as unknown as Record<string, unknown>,
    reviewFieldsPatch,
  ) as unknown as AiExpenseDraftFields;

  if (shouldReinterpretTax) {
    const reinterpreted = await deps.taxInterpretation.persistInterpretation({
      draftId: args.draftId,
      groupId: ctx.groupId,
      draft: currentDraft,
      items: currentItems,
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
        ...(args.priceTaxTreatment === undefined
          ? []
          : [RECEIPT_TAX_CHOICE_FIELDS.priceTaxTreatment]),
        ...(args.taxRateComposition === undefined
          ? []
          : [RECEIPT_TAX_CHOICE_FIELDS.taxRateComposition]),
        ...(args.items === undefined ? [] : ["items"]),
      ],
      updatedAt: now,
      draft: reinterpreted.draft,
      items: reinterpreted.items,
    });
    return await reconcileRegisteredDraft(updated, reinterpreted.items);
  }

  const statusPatch = {
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
  };
  await deps.drafts.patch(args.draftId, statusPatch);
  currentDraft = applyRecordPatch(
    currentDraft as unknown as Record<string, unknown>,
    statusPatch,
  ) as unknown as AiExpenseDraftFields;

  const updated = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: [
      ...REVIEW_OVERRIDE_FIELDS,
      "receiptTotalResolution",
      ...(args.items === undefined ? [] : ["items"]),
    ],
    updatedAt: now,
    draft: currentDraft,
    items: currentItems,
  });
  return await reconcileRegisteredDraft(updated, currentItems);

  async function reconcileRegisteredDraft(
    updatedDraft: AiExpenseDraftFields,
    updatedItems: AiExpenseDraftItemFields[],
  ): Promise<AiExpenseDraftFields> {
    if (!wasRegistered) {
      return updatedDraft;
    }
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
    const reconcilePatch = {
      status: "registered" as const,
      ...buildRegistrationPatchFields({
        destination: "expense_entries" as const,
        registrationMode: resolveRegistrationMode(updatedDraft),
        amountYen: updatedDraft.amountYen!,
        date: updatedDraft.date!,
        categoryIds: [...new Set(registrationItems.map((item) => item.categoryId))],
        registeredAt: resolveRegisteredAt(updatedDraft, now),
      }),
      updatedAt: now,
    };
    await deps.drafts.patch(args.draftId, reconcilePatch);
    return applyRecordPatch(
      updatedDraft as unknown as Record<string, unknown>,
      reconcilePatch,
    ) as unknown as AiExpenseDraftFields;
  }
}
