import { useState } from "react";
import { useMutation } from "convex/react";
import { deleteDraftApi } from "../../../lib/repositories/aiExpenseDrafts";
import { cancelImageJobApi } from "../../../lib/repositories/receiptAnalysisJobs";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { AiExpenseQueueItem } from "../types/types";
import { getAiExpenseQueueDeleteErrorMessage } from "../../../../lib/domain/aiExpenseDrafts/userFacingErrors";

export function useQueueDelete() {
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [hiddenItemIds, setHiddenItemIds] = useState<string[]>([]);
  const [queueDeleteError, setQueueDeleteError] = useState("");

  const cancelImageJob = useMutation(cancelImageJobApi());
  const deleteDraft = useMutation(deleteDraftApi());

  const deleteQueueItem = async (item: AiExpenseQueueItem): Promise<boolean> => {
    if (deletingIds.includes(item.id)) {
      return false;
    }
    setQueueDeleteError("");
    setDeletingIds((current) => [...current, item.id]);
    try {
      if (item.status === "queued" || item.status === "analyzing") {
        await cancelImageJob({ jobId: item.id as Id<"receiptAnalysisImageJobs"> });
      } else {
        await deleteDraft({ draftId: item.id as Id<"aiExpenseDrafts"> });
      }
      setHiddenItemIds((current) => (current.includes(item.id) ? current : [...current, item.id]));
      return true;
    } catch (error) {
      console.error("AI expense queue delete failed", error);
      setQueueDeleteError(getAiExpenseQueueDeleteErrorMessage());
      return false;
    } finally {
      setDeletingIds((current) => current.filter((id) => id !== item.id));
    }
  };

  const handleClearOpenQueue = async (clearableItems: AiExpenseQueueItem[]) => {
    for (const item of clearableItems) {
      await deleteQueueItem(item);
    }
  };

  return {
    deletingIds,
    hiddenItemIds,
    queueDeleteError,
    setDeletingIds,
    setHiddenItemIds,
    setQueueDeleteError,
    deleteQueueItem,
    handleClearOpenQueue,
  };
}
