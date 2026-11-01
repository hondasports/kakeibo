import { ConvexError } from "convex/values";
import { AI_EXPENSE_DRAFT_NOT_FOUND_MESSAGE } from "../../domain/aiExpenseDrafts/constants";

export async function findDraftInGroup<T extends { groupId: string }>(
  drafts: { findById(id: string): Promise<T | null> },
  groupId: string,
  draftId: string,
): Promise<T | null> {
  const draft = await drafts.findById(draftId);
  return draft?.groupId === groupId ? draft : null;
}

export async function loadDraftInGroup<T extends { groupId: string }>(
  drafts: { findById(id: string): Promise<T | null> },
  groupId: string,
  draftId: string,
): Promise<T> {
  const draft = await findDraftInGroup(drafts, groupId, draftId);
  if (draft === null) throw new ConvexError(AI_EXPENSE_DRAFT_NOT_FOUND_MESSAGE);
  return draft;
}
