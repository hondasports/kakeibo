/**
 * SystemAdminAuditLogStore の Convex 実装。
 * フィルタ組み合わせ→インデックス選択の分岐順序はベース実装を維持する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  SystemAdminAuditLogReader,
  SystemAdminAuditLogRecord,
  SystemAdminAuditLogStore,
} from "../../domain/systemAdmin/auditLog";

function auditDocToRecord(doc: Doc<"systemAdminAuditLogs">): SystemAdminAuditLogRecord {
  const { _id, ...fields } = doc;
  return { ...fields, id: _id } as SystemAdminAuditLogRecord;
}

export function createSystemAdminAuditLogReader(
  ctx: Pick<QueryCtx, "db">,
): SystemAdminAuditLogReader {
  return {
    async paginate(filter, opts) {
      const { from, to, action, actorUserId, targetUserId } = filter;
      const page =
        action && actorUserId && targetUserId
          ? await ctx.db
              .query("systemAdminAuditLogs")
              .withIndex("by_action_and_actor_user_id_and_target_user_id_and_created_at", (q) =>
                q
                  .eq("action", action)
                  .eq("actorUserId", actorUserId as Id<"users">)
                  .eq("targetUserId", targetUserId as Id<"users">)
                  .gte("createdAt", from)
                  .lte("createdAt", to),
              )
              .order("desc")
              .paginate(opts)
          : action && actorUserId
            ? await ctx.db
                .query("systemAdminAuditLogs")
                .withIndex("by_action_and_actor_user_id_and_created_at", (q) =>
                  q
                    .eq("action", action)
                    .eq("actorUserId", actorUserId as Id<"users">)
                    .gte("createdAt", from)
                    .lte("createdAt", to),
                )
                .order("desc")
                .paginate(opts)
            : action && targetUserId
              ? await ctx.db
                  .query("systemAdminAuditLogs")
                  .withIndex("by_action_and_target_user_id_and_created_at", (q) =>
                    q
                      .eq("action", action)
                      .eq("targetUserId", targetUserId as Id<"users">)
                      .gte("createdAt", from)
                      .lte("createdAt", to),
                  )
                  .order("desc")
                  .paginate(opts)
              : actorUserId && targetUserId
                ? await ctx.db
                    .query("systemAdminAuditLogs")
                    .withIndex("by_actor_user_id_and_target_user_id_and_created_at", (q) =>
                      q
                        .eq("actorUserId", actorUserId as Id<"users">)
                        .eq("targetUserId", targetUserId as Id<"users">)
                        .gte("createdAt", from)
                        .lte("createdAt", to),
                    )
                    .order("desc")
                    .paginate(opts)
                : action
                  ? await ctx.db
                      .query("systemAdminAuditLogs")
                      .withIndex("by_action_and_created_at", (q) =>
                        q.eq("action", action).gte("createdAt", from).lte("createdAt", to),
                      )
                      .order("desc")
                      .paginate(opts)
                  : actorUserId
                    ? await ctx.db
                        .query("systemAdminAuditLogs")
                        .withIndex("by_actor_user_id_and_created_at", (q) =>
                          q
                            .eq("actorUserId", actorUserId as Id<"users">)
                            .gte("createdAt", from)
                            .lte("createdAt", to),
                        )
                        .order("desc")
                        .paginate(opts)
                    : targetUserId
                      ? await ctx.db
                          .query("systemAdminAuditLogs")
                          .withIndex("by_target_user_id_and_created_at", (q) =>
                            q
                              .eq("targetUserId", targetUserId as Id<"users">)
                              .gte("createdAt", from)
                              .lte("createdAt", to),
                          )
                          .order("desc")
                          .paginate(opts)
                      : await ctx.db
                          .query("systemAdminAuditLogs")
                          .withIndex("by_created_at", (q) =>
                            q.gte("createdAt", from).lte("createdAt", to),
                          )
                          .order("desc")
                          .paginate(opts);
      return { ...page, page: page.page.map(auditDocToRecord) };
    },
  };
}

export function createSystemAdminAuditLogStore(
  ctx: Pick<MutationCtx, "db">,
): SystemAdminAuditLogStore {
  return {
    ...createSystemAdminAuditLogReader(ctx),
    async insert(fields) {
      return await ctx.db.insert(
        "systemAdminAuditLogs",
        fields as Omit<Doc<"systemAdminAuditLogs">, "_id" | "_creationTime">,
      );
    },
  };
}
