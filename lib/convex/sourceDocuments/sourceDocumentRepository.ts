/**
 * SourceDocumentRepository の Convex 実装。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { SourceDocumentFields } from "../../domain/sourceDocuments/sourceDocument";
import type { SourceDocumentRepository } from "../../domain/sourceDocuments/sourceDocumentRepository";

function toFields(doc: Doc<"sourceDocuments">): SourceDocumentFields {
  const { _id, _creationTime, ...fields } = doc;
  return fields;
}

export function createSourceDocumentRepository(
  ctx: Pick<MutationCtx, "db">,
): SourceDocumentRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"sourceDocuments">);
      return doc === null ? null : toFields(doc);
    },
    async insert(fields) {
      return await ctx.db.insert("sourceDocuments", {
        ...fields,
        groupId: fields.groupId as Id<"groups">,
        imageStorageId: fields.imageStorageId as Id<"_storage"> | undefined,
      });
    },
  };
}
