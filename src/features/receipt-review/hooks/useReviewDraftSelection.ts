import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { toReviewableDraftWithItems } from "../utils/mappers";
import type {
  AiExpenseDraft,
  AiExpenseDraftItem,
} from "../../../../lib/domain/aiExpenseDrafts/reviewTypes";

export function useReviewDraftSelection({
  initialReviewDrafts,
  initialReviewDraftItems,
}: {
  initialReviewDrafts: Record<string, AiExpenseDraft>;
  initialReviewDraftItems: Record<string, AiExpenseDraftItem[]>;
}) {
  const [selectedReviewDraftId, setSelectedReviewDraftId] = useState<string | null>(null);
  const [reviewDraftOverride, setReviewDraftOverride] = useState<AiExpenseDraft | null>(null);

  const localReviewDraft = selectedReviewDraftId
    ? initialReviewDrafts[selectedReviewDraftId]
    : undefined;
  const localReviewItems = selectedReviewDraftId
    ? initialReviewDraftItems[selectedReviewDraftId]
    : undefined;
  const rawSelectedReviewDraftDetails = useQuery(
    api.aiExpenseDrafts.queries.getWithItems,
    selectedReviewDraftId && !localReviewDraft
      ? { draftId: selectedReviewDraftId as Id<"aiExpenseDrafts"> }
      : "skip",
  );
  const selectedReviewDraftDetails = toReviewableDraftWithItems(rawSelectedReviewDraftDetails);

  // queued / analyzing の解析中下書きはレビュー対象外なので、選択自体を解除する
  if (
    selectedReviewDraftId !== null &&
    !localReviewDraft &&
    rawSelectedReviewDraftDetails !== undefined &&
    rawSelectedReviewDraftDetails !== null &&
    selectedReviewDraftDetails === null
  ) {
    setSelectedReviewDraftId(null);
    setReviewDraftOverride(null);
  }

  const selectedReviewDraft =
    reviewDraftOverride ??
    (localReviewDraft ? localReviewDraft : (selectedReviewDraftDetails?.draft ?? null));
  const isReviewDraftNotFound =
    selectedReviewDraftId !== null && !localReviewDraft && rawSelectedReviewDraftDetails === null;
  const isReviewDraftLoading =
    selectedReviewDraftId !== null &&
    !localReviewDraft &&
    rawSelectedReviewDraftDetails === undefined;

  const clearSelection = () => {
    setSelectedReviewDraftId(null);
    setReviewDraftOverride(null);
  };

  return {
    selectedReviewDraftId,
    setSelectedReviewDraftId,
    localReviewItems,
    selectedReviewDraftDetails,
    selectedReviewDraft,
    isReviewDraftNotFound,
    isReviewDraftLoading,
    clearSelection,
    setReviewDraftOverride,
  };
}
