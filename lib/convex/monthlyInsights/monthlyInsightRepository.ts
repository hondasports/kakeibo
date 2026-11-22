import type { GenericDatabaseReader, GenericDatabaseWriter } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DataModel } from "../../../convex/_generated/dataModel";
import type { MonthlyInsightRepository } from "../../domain/monthlyInsights/monthlyInsightRepository";

type Db = GenericDatabaseReader<DataModel> & GenericDatabaseWriter<DataModel>;

export function createMonthlyInsightRepository(ctx: { db: Db }): MonthlyInsightRepository {
  return {
    async findByGroupAndMonth(groupId, month) {
      const row = await ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("month", month),
        )
        .unique();
      if (row === null) return null;
      return {
        groupId: row.groupId,
        month: row.month,
        commentText: row.commentText,
        source: row.source,
        generatedAt: row.generatedAt,
      };
    },
    async upsert(record) {
      const existing = await ctx.db
        .query("monthlyInsights")
        .withIndex("by_group_id_and_month", (q) =>
          q.eq("groupId", record.groupId as Id<"groups">).eq("month", record.month),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          commentText: record.commentText,
          source: record.source,
          generatedAt: record.generatedAt,
        });
      } else {
        await ctx.db.insert("monthlyInsights", {
          ...record,
          groupId: record.groupId as Id<"groups">,
        });
      }
    },
  };
}
