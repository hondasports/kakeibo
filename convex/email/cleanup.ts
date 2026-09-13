import { internalMutation } from "../_generated/server";
import { cleanupOldEmailRecords as cleanupOldEmailRecordsUsecase } from "../../lib/usecase/email/cleanup";
import { createCleanupEmailDeps } from "../../lib/convex/email/emailDeps";

export const cleanupOldEmailRecords = internalMutation({
  args: {},
  handler: async (ctx) => {
    await cleanupOldEmailRecordsUsecase(createCleanupEmailDeps(ctx));
  },
});
