/**
 * SystemAdminNotificationStore の Convex 実装。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc } from "../../../convex/_generated/dataModel";
import type {
  SystemAdminNotificationRecord,
  SystemAdminNotificationStore,
} from "../../domain/systemAdmin/notificationStore";

function notificationDocToRecord(
  doc: Doc<"systemAdminNotifications">,
): SystemAdminNotificationRecord {
  return {
    id: doc._id,
    action: doc.action,
    recipientUserId: doc.recipientUserId,
    recipientEmail: doc.recipientEmail,
    targetUserId: doc.targetUserId,
    targetEmailSnapshot: doc.targetEmailSnapshot,
    dedupeKey: doc.dedupeKey,
    payloadJson: doc.payloadJson,
    createdAt: doc.createdAt,
  };
}

export function createSystemAdminNotificationStore(
  ctx: Pick<MutationCtx, "db">,
): SystemAdminNotificationStore {
  return {
    async findByDedupeKey(dedupeKey) {
      const doc = await ctx.db
        .query("systemAdminNotifications")
        .withIndex("by_dedupe_key", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
      return doc === null ? null : notificationDocToRecord(doc);
    },
    async insert(fields) {
      return await ctx.db.insert(
        "systemAdminNotifications",
        fields as Omit<Doc<"systemAdminNotifications">, "_id" | "_creationTime">,
      );
    },
  };
}
