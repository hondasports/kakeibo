const GROUP_DELETION_ERROR_CATEGORIES = new Set([
  "batch_processing_failed",
  "identity_deletion_failed",
  "finalization_failed",
  "unknown",
] as const);

export type GroupDeletionErrorCategory =
  typeof GROUP_DELETION_ERROR_CATEGORIES extends Set<infer T> ? T : never;

export function sanitizeGroupDeletionErrorCategory(
  category: string | undefined,
): GroupDeletionErrorCategory | undefined {
  if (category === undefined) return undefined;
  return GROUP_DELETION_ERROR_CATEGORIES.has(category as GroupDeletionErrorCategory)
    ? (category as GroupDeletionErrorCategory)
    : "unknown";
}
