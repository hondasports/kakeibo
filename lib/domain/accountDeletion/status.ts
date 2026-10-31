import { ACCOUNT_DELETION_REQUEST_STATUSES, type AccountDeletionRequestStatus } from "./request";

export const accountDeletionActiveStatuses: readonly Exclude<
  AccountDeletionRequestStatus,
  "completed"
>[] = ACCOUNT_DELETION_REQUEST_STATUSES.filter((status) => status !== "completed");

export type AccountDeletionActiveStatus = (typeof accountDeletionActiveStatuses)[number];

export function isActiveAccountDeletionStatus(
  status: string,
): status is AccountDeletionActiveStatus {
  return (accountDeletionActiveStatuses as readonly string[]).includes(status);
}

/** Clerk 削除へ進む前の状態。failed / completed / 削除後の状態へは戻さない。 */
export function canMarkDeletingIdentityFrom(status: string): boolean {
  return (
    status === "requested" ||
    status === "preparing_groups" ||
    status === "purging_groups" ||
    status === "deleting_identity" ||
    status === "retry_wait"
  );
}

/**
 * Clerk ユーザー削除の成功を記録してよい状態。
 * 削除成功は取り消せない事実なので、並行する古い action が failed / retry_wait へ進めていても
 * 記録を拒否しない（拒否すると identityDeletedAt が残らず、本人は認証できず自動復旧も対象外になり孤立する）。
 * 拒否するのは、終端の completed と、すでに記録済み（identity_deleted / finalization_retry_wait）の状態のみ。
 */
export function canMarkIdentityDeletedFrom(status: string): boolean {
  return (
    status === "requested" ||
    status === "preparing_groups" ||
    status === "purging_groups" ||
    status === "deleting_identity" ||
    status === "retry_wait" ||
    status === "failed"
  );
}

export function isAccountDeletionFinalizableStatus(status: string): boolean {
  return status === "identity_deleted" || status === "finalization_retry_wait";
}
