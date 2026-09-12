/**
 * Convex Doc とドメイン record の相互変換。
 * Doc の _id/_creationTime をドメインの id/creationTime に写し替える。
 */
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";

export function draftDocToFields(doc: Doc<"aiExpenseDrafts">): AiExpenseDraftFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id, creationTime: _creationTime } as AiExpenseDraftFields;
}

export function draftFieldsToDoc(fields: AiExpenseDraftFields): Doc<"aiExpenseDrafts"> {
  const { id, creationTime, ...rest } = fields;
  return {
    ...rest,
    _id: id as Id<"aiExpenseDrafts">,
    _creationTime: creationTime as number,
  } as Doc<"aiExpenseDrafts">;
}

export function draftItemDocToFields(doc: Doc<"aiExpenseDraftItems">): AiExpenseDraftItemFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id, creationTime: _creationTime } as AiExpenseDraftItemFields;
}

export function draftItemFieldsToDoc(fields: AiExpenseDraftItemFields): Doc<"aiExpenseDraftItems"> {
  const { id, creationTime, ...rest } = fields;
  return {
    ...rest,
    _id: id as Id<"aiExpenseDraftItems">,
    _creationTime: creationTime as number,
  } as Doc<"aiExpenseDraftItems">;
}
