/**
 * WeekSessionStore の Convex 実装。
 * endpoint が発行していた ctx.db 呼出形状をここに隔離する。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  NewWeekSessionFields,
  WeekSessionPatch,
  WeekSessionRecord,
  WeekSessionStore,
} from "../../domain/weekSessions/store";

export function docToWeekSessionRecord(doc: Doc<"weekSessions">): WeekSessionRecord {
  return {
    id: doc._id,
    creationTime: doc._creationTime,
    groupId: doc.groupId,
    weekStartDate: doc.weekStartDate,
    weekEndDate: doc.weekEndDate,
    ...(doc.reviewMemo === undefined ? {} : { reviewMemo: doc.reviewMemo }),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** presentation 層が既存の Doc 返却形状を再現するための変換。 */
export function weekSessionRecordToDoc(record: WeekSessionRecord): Doc<"weekSessions"> {
  return {
    _id: record.id as Id<"weekSessions">,
    _creationTime: record.creationTime,
    groupId: record.groupId as Id<"groups">,
    weekStartDate: record.weekStartDate,
    weekEndDate: record.weekEndDate,
    ...(record.reviewMemo === undefined ? {} : { reviewMemo: record.reviewMemo }),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** query 側でも使える読み取り専用メソッド。 */
export type WeekSessionReader = Pick<WeekSessionStore, "findByGroupAndWeekStart" | "get">;

export function createWeekSessionReader(ctx: Pick<QueryCtx, "db">): WeekSessionReader {
  return {
    async findByGroupAndWeekStart(groupId, weekStartDate) {
      const doc = await ctx.db
        .query("weekSessions")
        .withIndex("by_group_id_and_week_start_date", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("weekStartDate", weekStartDate),
        )
        .unique();
      return doc === null ? null : docToWeekSessionRecord(doc);
    },

    async get(id) {
      const doc = await ctx.db.get(id as Id<"weekSessions">);
      return doc === null ? null : docToWeekSessionRecord(doc);
    },
  };
}

export function createWeekSessionStore(ctx: Pick<MutationCtx, "db">): WeekSessionStore {
  return {
    ...createWeekSessionReader(ctx),

    async insert(fields: NewWeekSessionFields) {
      return await ctx.db.insert("weekSessions", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
      });
    },

    async patch(id, patch: WeekSessionPatch) {
      await ctx.db.patch(id as Id<"weekSessions">, patch);
    },
  };
}
