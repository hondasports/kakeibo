import { createContext, useContext, type ReactNode } from "react";
import { useAiExpenseQueuePanel } from "../hooks/useAiExpenseQueuePanel";
import type { AiExpenseQueuePanelProps } from "../../../types/aiExpenseQueue";

type AiExpenseQueuePanelState = ReturnType<typeof useAiExpenseQueuePanel>;

const AiExpenseQueuePanelContext = createContext<AiExpenseQueuePanelState | null>(null);

export function AiExpenseQueuePanelProvider({
  categories = [],
  children,
  initialItems,
  initialReviewDraftItems,
  initialReviewDrafts = {},
  onReviewSubmit,
}: AiExpenseQueuePanelProps & { children: ReactNode }) {
  const queue = useAiExpenseQueuePanel({
    categories,
    initialItems,
    initialReviewDraftItems,
    initialReviewDrafts,
    onReviewSubmit,
  });

  return (
    <AiExpenseQueuePanelContext.Provider value={queue}>
      {children}
    </AiExpenseQueuePanelContext.Provider>
  );
}

export function useAiExpenseQueuePanelContext(): AiExpenseQueuePanelState {
  const queue = useContext(AiExpenseQueuePanelContext);
  if (!queue) {
    throw new Error(
      "useAiExpenseQueuePanelContext must be used within AiExpenseQueuePanelProvider",
    );
  }
  return queue;
}
