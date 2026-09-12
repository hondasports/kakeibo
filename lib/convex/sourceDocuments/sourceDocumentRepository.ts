/**
 * SourceDocumentRepository の Convex 実装。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SourceDocumentRepository } from "../../domain/sourceDocuments/sourceDocumentRepository";

export function createSourceDocumentRepository(
  ctx: Pick<MutationCtx, "db">,
): SourceDocumentRepository {
  return {
    async insert(fields) {
      return await ctx.db.insert("sourceDocuments", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
        imageStorageId: fields.imageStorageId as Id<"_storage"> | undefined,
      });
    },
  };
}
