import type { EmailSuppressionStore, UpsertEmailSuppressionArgs } from "../../domain/email/store";

export type SuppressionDeps = {
  suppressions: EmailSuppressionStore;
};

export async function upsertEmailSuppression(
  deps: SuppressionDeps,
  args: UpsertEmailSuppressionArgs,
): Promise<string> {
  const existing = await deps.suppressions.findByNormalizedEmail(args.normalizedEmail);
  if (existing) {
    await deps.suppressions.updateSuppression(existing.id, {
      reason: args.reason,
      source: args.source,
      providerMessageId: args.providerMessageId,
      updatedAt: args.createdAt,
    });
    return existing.id;
  }
  return await deps.suppressions.insertSuppression({
    email: args.email,
    normalizedEmail: args.normalizedEmail,
    reason: args.reason,
    source: args.source,
    providerMessageId: args.providerMessageId,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  });
}
