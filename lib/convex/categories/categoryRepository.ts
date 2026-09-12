/**
 * CategoryRepository の Convex 実装。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  CategoryRecord,
  CategoryRepository,
} from "../../domain/categories/categoryRepository";

export function createCategoryRepository(ctx: Pick<QueryCtx, "db">): CategoryRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"categories">);
      if (doc === null) {
        return null;
      }
      const record: CategoryRecord = {
        id: doc._id,
        groupId: doc.groupId,
        name: doc.name,
        isActive: doc.isActive,
      };
      return record;
    },
  };
}
