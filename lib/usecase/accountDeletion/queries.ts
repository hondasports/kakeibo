/**
 * 退会プレビュー・ステータス参照のクエリ系ユースケース。
 */
import { ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE } from "../../domain/accountDeletion/classification";
import { getAccountDeletionErrorCategory } from "../../domain/accountDeletion/errorCategory";
import type { AccountDeletionQueryDeps } from "./deps";
import { loadAccountDeletionClassification } from "./classification";

const DEFAULT_BATCH_LIMIT = 25;

export async function getAccountDeletionPreview(
  deps: Pick<AccountDeletionQueryDeps, "memberships" | "groups">,
  userId: string,
) {
  try {
    const { classification } = await loadAccountDeletionClassification(deps, userId);
    return {
      canDelete: classification.blockingGroups.length === 0,
      errorCode: null,
      ...classification,
    };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== ACCOUNT_DELETION_GROUP_MEMBERSHIP_INVARIANT_MESSAGE
    ) {
      throw error;
    }
    return {
      canDelete: false,
      errorCode: "GROUP_MEMBERSHIP_INVARIANT",
      groupsToLeave: [],
      groupsToDelete: [],
      blockingGroups: [],
    };
  }
}

export async function getMyAccountDeletionStatus(
  deps: Pick<AccountDeletionQueryDeps, "requests">,
  userId: string,
) {
  const requests = await deps.requests.listByUser(userId, DEFAULT_BATCH_LIMIT);
  const request = requests.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!request || request.status === "completed") return null;
  return {
    status: request.status,
    nextRetryAt: request.nextRetryAt ?? null,
    errorCategory: getAccountDeletionErrorCategory(request.status, request.lastErrorCode),
  };
}
