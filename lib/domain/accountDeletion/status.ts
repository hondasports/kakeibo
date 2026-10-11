export const accountDeletionActiveStatuses = [
  "requested",
  "preparing_groups",
  "purging_groups",
  "deleting_identity",
  "retry_wait",
  "identity_deleted",
  "finalization_retry_wait",
  "failed",
] as const;

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

/** identity_deleted へ進めてよいのは Clerk 削除処理中（deleting_identity）のみ。 */
export function canMarkIdentityDeletedFrom(status: string): boolean {
  return status === "deleting_identity";
}

export function isAccountDeletionFinalizableStatus(status: string): boolean {
  return status === "identity_deleted" || status === "finalization_retry_wait";
}
