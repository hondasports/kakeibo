/**
 * TransactionalEmailQueue の Convex 実装。
 * convex/email/jobs の enqueueTransactionalEmailJobHandler へ委譲する
 * （テンプレート検証・メール正規化・ジョブ永続化はそちらの責務）。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { TransactionalEmailQueue } from "../../domain/email/emailQueue";
import { enqueueTransactionalEmailJobHandler } from "../../../convex/email/jobs";
import type { TransactionalEmailType } from "../../email/model";

export function createTransactionalEmailQueue(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): TransactionalEmailQueue {
  return {
    async enqueue({ templateType, payloadJson, recipientEmail, businessDedupeKey }) {
      return await enqueueTransactionalEmailJobHandler(ctx as MutationCtx, {
        templateType: templateType as TransactionalEmailType,
        payloadJson,
        recipientEmail,
        businessDedupeKey,
      });
    },
  };
}
