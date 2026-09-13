/**
 * lineImageJobs の状態遷移ユースケース。
 * pending のジョブのみ遷移可能で、それ以外は何もしない。
 */
import type { LineImageJobStore } from "../../domain/lineWebhook/imageJobStore";
import type { LineImageSkipReason } from "../../domain/lineWebhook/records";

export type ImageJobTransitionDeps = {
  imageJobs: LineImageJobStore;
};

export async function markImageJobSkipped(
  deps: ImageJobTransitionDeps,
  webhookEventId: string,
  skipReason: LineImageSkipReason,
): Promise<void> {
  const job = await deps.imageJobs.findByWebhookEventId(webhookEventId);
  if (job === null || job.status !== "pending") return;
  await deps.imageJobs.patch(job.id, {
    status: "skipped",
    skipReason,
    updatedAt: Date.now(),
  });
}

export async function markImageJobDrafted(
  deps: ImageJobTransitionDeps,
  webhookEventId: string,
  draftId: string,
): Promise<void> {
  const job = await deps.imageJobs.findByWebhookEventId(webhookEventId);
  if (job === null || job.status !== "pending") return;
  await deps.imageJobs.patch(job.id, {
    status: "drafted",
    draftId,
    updatedAt: Date.now(),
  });
}

export async function markImageJobFailed(
  deps: ImageJobTransitionDeps,
  webhookEventId: string,
  draftId?: string,
): Promise<void> {
  const job = await deps.imageJobs.findByWebhookEventId(webhookEventId);
  if (job === null || job.status !== "pending") return;
  await deps.imageJobs.patch(job.id, {
    status: "failed",
    ...(draftId === undefined ? {} : { draftId }),
    updatedAt: Date.now(),
  });
}
