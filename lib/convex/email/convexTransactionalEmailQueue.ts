/**
 * TransactionalEmailQueue の Convex 実装。
 * usecase の enqueueTransactionalEmailJob へ委譲する
 * （テンプレート検証・メール正規化・ジョブ永続化は usecase/domain の責務）。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { TransactionalEmailQueue } from "../../domain/email/emailQueue";
import { enqueueTransactionalEmailJob } from "../../usecase/email/enqueueJob";
import type { TransactionalEmailType } from "../../email/model";
import { createEnqueueJobDeps } from "./emailDeps";

export function createTransactionalEmailQueue(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): TransactionalEmailQueue {
  return {
    async enqueue({ templateType, payloadJson, recipientEmail, businessDedupeKey }) {
      return await enqueueTransactionalEmailJob(createEnqueueJobDeps(ctx), {
        templateType: templateType as TransactionalEmailType,
        payloadJson,
        recipientEmail,
        businessDedupeKey,
      });
    },
  };
}
