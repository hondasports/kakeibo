/**
 * 削除影響プレビューの集計（query 側ユースケース）。
 * 各テーブルを PREVIEW_LIMIT+1 件だけ走査して件数と精度を返す。
 */
import {
  boundedPreview,
  deriveReceiptImageCount,
  DELETION_PREVIEW_LIMIT,
} from "../../domain/groupDeletion/impact";
import type { GroupDeletionImpactCounts } from "../../domain/groupDeletion/groupDeletionWorkflow";
import type { PurgeStage } from "../../domain/groupDeletion/stages";
import type { GroupDeletionQueryDeps } from "./deps";

const STAGE_BY_METRIC = {
  members: "groupMembers",
  invitations: "groupInvitations",
  sourceDocuments: "sourceDocuments",
  expenseEntries: "expenseEntries",
  receipts: "receipts",
  categories: "categories",
  aiDrafts: "aiExpenseDrafts",
  aiDraftItems: "aiExpenseDraftItems",
  analysisBatches: "receiptAnalysisBatches",
  analysisJobs: "receiptAnalysisImageJobs",
  weekSessions: "weekSessions",
  managementAuditLogs: "managementAuditLogs",
  monthlyInsights: "monthlyInsights",

  recurringRules: "recurringEntryRules",
} as const satisfies Record<string, PurgeStage>;

export async function countGroupDeletionImpact(
  deps: Pick<GroupDeletionQueryDeps, "purge">,
  groupId: string,
): Promise<GroupDeletionImpactCounts> {
  const count = async (stage: PurgeStage) =>
    boundedPreview(await deps.purge.takeStageDocuments(stage, groupId, DELETION_PREVIEW_LIMIT + 1));

  const members = await count(STAGE_BY_METRIC.members);
  const invitations = await count(STAGE_BY_METRIC.invitations);
  const sourceDocuments = await count(STAGE_BY_METRIC.sourceDocuments);
  const expenseEntries = await count(STAGE_BY_METRIC.expenseEntries);
  const receipts = await count(STAGE_BY_METRIC.receipts);
  const categories = await count(STAGE_BY_METRIC.categories);
  const aiDrafts = await count(STAGE_BY_METRIC.aiDrafts);
  const aiDraftItems = await count(STAGE_BY_METRIC.aiDraftItems);
  const analysisBatches = await count(STAGE_BY_METRIC.analysisBatches);
  const analysisJobs = await count(STAGE_BY_METRIC.analysisJobs);
  const weekSessions = await count(STAGE_BY_METRIC.weekSessions);
  const managementAuditLogs = await count(STAGE_BY_METRIC.managementAuditLogs);
  const monthlyInsights = await count(STAGE_BY_METRIC.monthlyInsights);

  const recurringRules = await count(STAGE_BY_METRIC.recurringRules);

  return {
    members: members.result,
    invitations: invitations.result,
    sourceDocuments: sourceDocuments.result,
    receiptImages: deriveReceiptImageCount(sourceDocuments),
    expenseEntries: expenseEntries.result,
    receipts: receipts.result,
    categories: categories.result,
    aiDrafts: aiDrafts.result,
    aiDraftItems: aiDraftItems.result,
    analysisBatches: analysisBatches.result,
    analysisJobs: analysisJobs.result,
    weekSessions: weekSessions.result,
    managementAuditLogs: managementAuditLogs.result,
    monthlyInsights: monthlyInsights.result,

    recurringRules: recurringRules.result,
  };
}
