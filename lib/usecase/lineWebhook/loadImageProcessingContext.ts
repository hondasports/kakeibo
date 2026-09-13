/**
 * 画像処理に必要なコンテキスト（連携一意性・同意・グループ解決・カテゴリ）の組み立て。
 */
import { MAX_CATEGORIES_PER_GROUP } from "../../domain/categories/defaults";
import type { LineActiveGroupResolver } from "../../domain/lineWebhook/activeGroupResolver";
import type { LineAccountLinkReader } from "../../domain/lineWebhook/accountLinkReader";
import type { LineImageProcessingContext } from "../../domain/lineWebhook/actionRunner";
import type { LineSummaryDataReader } from "../../domain/lineWebhook/summaryDataReader";
import type { LineWebhookUserReader } from "../../domain/lineWebhook/userReader";

export type LoadImageProcessingContextDeps = {
  accountLinks: LineAccountLinkReader;
  users: LineWebhookUserReader;
  activeGroup: LineActiveGroupResolver;
  summaryData: LineSummaryDataReader;
};

export async function loadImageProcessingContext(
  deps: LoadImageProcessingContextDeps,
  userId: string,
): Promise<LineImageProcessingContext> {
  const activeLinks = await deps.accountLinks.listActiveByUserId(userId, 2);
  const hasUniqueActiveLink = activeLinks.length === 1;

  const consentAcceptedAt = await deps.users.findReceiptImageConsentAcceptedAt(userId);
  const hasConsent = consentAcceptedAt !== undefined;

  const groupResolution = await deps.activeGroup.resolve(userId);
  if (groupResolution.status !== "resolved") {
    return {
      hasUniqueActiveLink,
      hasConsent,
      groupStatus: groupResolution.status,
      categories: [],
    };
  }

  const categories = await deps.summaryData.listActiveCategories(
    groupResolution.groupId,
    MAX_CATEGORIES_PER_GROUP,
  );

  return {
    hasUniqueActiveLink,
    hasConsent,
    groupStatus: "resolved" as const,
    groupId: groupResolution.groupId,
    categories,
  };
}
