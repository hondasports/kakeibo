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
      const { from, to, action, actorUserId, targetUserId, groupId } = filter;
      const ordered =
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
                : action
                  ? await ctx.db
                      .query("systemAdminAuditLogs")
                      .withIndex("by_action_and_created_at", (q) =>
                        q.eq("action", action).gte("createdAt", from).lte("createdAt", to),
                      )
                      .order("desc")
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
                      : await ctx.db
                          .query("systemAdminAuditLogs")
                          .withIndex("by_created_at", (q) =>
                            q.gte("createdAt", from).lte("createdAt", to),
                          )
                          .order("desc");
      let page: Awaited<ReturnType<typeof ordered.paginate>>;
      if (!groupId) {
        page = await ordered.paginate(opts);
      } else {
        // groupId は関係の種類ごとに index で読む。sourceGroupId / targetGroupId /
        // targetKind=group の targetId の OR は index では表せず、監査ログ全体を
        // 読む .filter() は増え続けるテーブルで読み取り上限に当たるため使わない。
        // 残りの条件（action/actor/targetUserId）はそのグループの行に限定して絞る。
        const relation = filter.groupRelation ?? "direct";
        const scoped =
          relation === "source"
            ? await ctx.db
                .query("systemAdminAuditLogs")
                .withIndex("by_source_group_id_and_created_at", (q) =>
                  q
                    .eq("sourceGroupId", groupId as Id<"groups">)
                    .gte("createdAt", from)
                    .lte("createdAt", to),
                )
                .order("desc")
            : relation === "target"
              ? await ctx.db
                  .query("systemAdminAuditLogs")
                  .withIndex("by_target_group_id_and_created_at", (q) =>
                    q
                      .eq("targetGroupId", groupId as Id<"groups">)
                      .gte("createdAt", from)
                      .lte("createdAt", to),
                  )
                  .order("desc")
              : await ctx.db
                  .query("systemAdminAuditLogs")
                  .withIndex("by_target_kind_and_target_id_and_created_at", (q) =>
                    q
                      .eq("targetKind", "group")
                      .eq("targetId", groupId)
                      .gte("createdAt", from)
                      .lte("createdAt", to),
                  )
                  .order("desc");
        page =
          action || actorUserId || targetUserId
            ? await scoped
                .filter((q) =>
                  q.and(
                    ...[
                      action ? q.eq(q.field("action"), action) : undefined,
                      actorUserId
                        ? q.eq(q.field("actorUserId"), actorUserId as Id<"users">)
                        : undefined,
                      targetUserId
                        ? q.eq(q.field("targetUserId"), targetUserId as Id<"users">)
                        : undefined,
                    ].filter(
                      (condition): condition is NonNullable<typeof condition> =>
                        condition !== undefined,
                    ),
                  ),
                )
                .paginate(opts)
            : await scoped.paginate(opts);
      }
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
