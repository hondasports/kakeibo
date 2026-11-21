type AccountDeletionResumeState = {
  identityDeletedAt?: number;
  preparationCompletedAt?: number;
};

export function resolveAccountDeletionResumeStatus(
  state: AccountDeletionResumeState,
): "identity_deleted" | "purging_groups" | "preparing_groups" {
  if (state.identityDeletedAt) return "identity_deleted";
  if (state.preparationCompletedAt) return "purging_groups";
  return "preparing_groups";
}
