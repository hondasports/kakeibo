import type { EmailJobActionRunner, EmailSender } from "../../domain/email/runner";
import { isTerminalEmailJobStatus, planSendFailure } from "../../domain/email/rules";
import type { EmailJobScheduler } from "../../domain/email/store";
import { buildTransactionalEmail } from "../../email/templateFactory";

export type ProcessEmailJobDeps = {
  runner: EmailJobActionRunner;
  sender: EmailSender;
  scheduler: EmailJobScheduler;
  now?: () => number;
};

export async function processEmailJob(
  deps: ProcessEmailJobDeps,
  { jobId }: { jobId: string },
): Promise<void> {
  const now = deps.now ?? Date.now;

  const job = await deps.runner.getJob(jobId);
  if (!job) {
    return;
  }

  if (isTerminalEmailJobStatus(job.status)) {
    return;
  }

  const suppression = await deps.runner.findSuppression(job.normalizedRecipientEmail);
  if (suppression) {
    await deps.runner.markJobTerminal({
      jobId,
      status: "suppressed",
      updatedAt: now(),
    });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(job.payloadJson);
  } catch {
    await deps.runner.markJobTerminal({
      jobId,
      status: "failed",
      errorMessage: "Invalid payload JSON",
      errorCode: "invalid_request",
      updatedAt: now(),
    });
    return;
  }

  const built = await buildTransactionalEmail(job.templateType, payload as never);

  const result = await deps.sender.send({
    to: job.recipientEmail,
    subject: built.subject,
    html: built.html,
    text: built.text,
    idempotencyKey: jobId,
  });

  const sentAt = now();

  if (result.ok) {
    await deps.runner.markJobSent({
      jobId,
      providerMessageId: result.providerMessageId,
      status: "sent",
      html: built.html,
      text: built.text,
      updatedAt: sentAt,
    });
    return;
  }

  const error = result.error;
  const nextAttempt = job.attemptCount + 1;
  const plan = planSendFailure(error, nextAttempt, sentAt);

  if (plan.kind === "failed") {
    await deps.runner.markJobTerminal({
      jobId,
      status: "failed",
      errorMessage: error.message,
      errorCode: error.code,
      updatedAt: sentAt,
    });
    return;
  }

  await deps.runner.markJobRetrying({
    jobId,
    status: "retrying",
    attemptCount: nextAttempt,
    nextRetryAt: plan.nextRetryAt,
    errorMessage: error.message,
    errorCode: error.code,
    updatedAt: sentAt,
  });

  await deps.scheduler.scheduleProcessJob(plan.delayMs, jobId);
}
