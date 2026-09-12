import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { checkCategoryUsabilityForEntry } from "../../domain/categories/usability";

export async function assertExpenseCategoryBelongsToGroup(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories">,
  groupId: Id<"groups">,
  options?: {
    inactiveErrorMessage?: string;
    allowInactiveWhenUnchangedFrom?: Id<"categories">;
  },
) {
  const category = await ctx.db.get(categoryId);
  const result = checkCategoryUsabilityForEntry(
    category === null
      ? null
      : { id: category._id, groupId: category.groupId, isActive: category.isActive },
    groupId,
    { allowInactiveWhenUnchangedFrom: options?.allowInactiveWhenUnchangedFrom },
  );
  if (!result.usable) {
    if (result.error === "not_found") {
      throw new ConvexError("Category not found");
    }
    if (result.error === "wrong_group") {
      throw new ConvexError("Category does not belong to the current group");
    }
    throw new ConvexError(
      options?.inactiveErrorMessage ?? "Inactive category cannot be used for new expense entries",
    );
  }
  return category;
}
