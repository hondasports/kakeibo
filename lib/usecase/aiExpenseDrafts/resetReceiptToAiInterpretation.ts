import { ConvexError } from "convex/values";
import {
  AiExpenseDraft,
  type AiExpenseDraftFields,
} from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { buildDraftListSummary } from "../../domain/aiExpenseDrafts/listSummary";
import { applyRecordPatch } from "../../domain/common/recordPatch";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";

const LIST_LIMIT = 100;

/**
 * 下書きを AI 解釈スナップショットの値へリセットする。
 * 明細をスナップショット内容で置き換え、receiptUserOverride を除去する。
 * 存在しない・他グループ所属はいずれも "not found" として拒否する（既存挙動）。
 */
export async function resetReceiptToAiInterpretation(
  ctx: Pick<UsecaseGroupContext, "groupId">,
  deps: Pick<AiExpenseDraftDeps, "drafts" | "draftItems">,
  args: { draftId: string },
): Promise<{ draft: AiExpenseDraftFields; items: AiExpenseDraftItemFields[] }> {
  const fields = await deps.drafts.findById(args.draftId);
  if (fields === null) {
    throw new ConvexError("AI expense draft not found");
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  if (!draft.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("AI expense draft not found");
  }
  try {
    draft.assertResettableToAiInterpretation();
  } catch (err) {
    throw toConvexError(err);
  }
  const values = draft.persisted.receiptInterpretation!.values;

  const currentItems = await deps.draftItems.listAllByDraft(ctx.groupId, args.draftId);
  for (const item of currentItems) {
    await deps.draftItems.delete(item.id!);
  }
  const now = Date.now();
  const insertedItems: AiExpenseDraftItemFields[] = [];
  for (const item of values.items) {
    const itemFields: Omit<AiExpenseDraftItemFields, "id" | "creationTime"> = {
      groupId: ctx.groupId,
      draftId: args.draftId,
      ...item,
      createdAt: now,
      updatedAt: now,
    };
    const id = await deps.draftItems.insert(itemFields);
    insertedItems.push({ ...itemFields, id });
  }
  const draftPatch = {
    status: values.status,
    documentType: values.documentType,
    shopName: values.shopName,
    paymentPlace: values.paymentPlace,
    payeeName: values.payeeName,
    paymentPurpose: values.paymentPurpose,
    date: values.date,
    amountYen: values.amountYen,
    registrationMode: values.registrationMode,
    taxSummaries: values.taxSummaries,
    receiptTotalResolution: values.receiptTotalResolution,
    receiptTaxDecision: values.receiptTaxDecision,
    markerDefinitions: values.markerDefinitions,
    categoryId: values.categoryId,
    confidence: values.confidence,
    warnings: values.warnings,
    reviewReasons: values.reviewReasons,
    receiptUserOverride: undefined,
    updatedAt: now,
  };
  // 一覧用の保存サマリはリセット後の下書き・明細（採番済み id 込み）から計算する。
  const patchedFields = applyRecordPatch(
    fields as unknown as Record<string, unknown>,
    draftPatch,
  ) as unknown as AiExpenseDraftFields;
  const listSummary = buildDraftListSummary(patchedFields, insertedItems);
  await deps.drafts.patch(args.draftId, { ...draftPatch, listSummary });
  const updatedDraft = await deps.drafts.findById(args.draftId);
  if (updatedDraft === null) {
    throw new ConvexError("AI expense draft not found after reset");
  }
  const updatedItems = await deps.draftItems.listByDraftAsc(ctx.groupId, args.draftId, LIST_LIMIT);
  return { draft: updatedDraft, items: updatedItems };
}
