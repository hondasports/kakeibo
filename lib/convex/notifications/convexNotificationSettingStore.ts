import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { TransactionalEmailType } from "../../email/model";
import type { NotificationChannel } from "../../domain/notifications/model";
import type { NotificationSettingRecord } from "../../domain/notifications/records";
import type {
  NotificationSettingReader,
  NotificationSettingStore,
} from "../../domain/notifications/store";

function docToRecord(doc: Doc<"notificationSettings">): NotificationSettingRecord {
  return {
    id: doc._id,
    type: doc.type,
    channel: doc.channel,
    enabled: doc.enabled,
    updatedByUserId: doc.updatedByUserId,
    updatedAt: doc.updatedAt,
  };
}

export function createNotificationSettingReader(
  ctx: Pick<QueryCtx, "db">,
): NotificationSettingReader {
  return {
    async findByTypeAndChannel(type: TransactionalEmailType, channel: NotificationChannel) {
      const doc = await ctx.db
        .query("notificationSettings")
        .withIndex("by_type_and_channel", (q) => q.eq("type", type).eq("channel", channel))
        .unique();
      return doc ? docToRecord(doc) : null;
    },
    async listAll(limit = 100) {
      const docs = await ctx.db.query("notificationSettings").take(limit);
      return docs.map(docToRecord);
    },
  };
}

export function createNotificationSettingStore(
  ctx: Pick<MutationCtx, "db">,
): NotificationSettingStore {
  return {
    ...createNotificationSettingReader(ctx),
    async insert(fields) {
      return await ctx.db.insert("notificationSettings", {
        ...fields,
        updatedByUserId: fields.updatedByUserId as Id<"users">,
      });
    },
    async patch(id, fields) {
      await ctx.db.patch(id as Id<"notificationSettings">, {
        enabled: fields.enabled,
        updatedByUserId: fields.updatedByUserId as Id<"users">,
        updatedAt: fields.updatedAt,
      });
    },
  };
}
