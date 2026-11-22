import type { ReceiptItem } from "../../summary-shared/types/types";
import { useSpendingBulkSelection } from "../../summary-shared/hooks/useSpendingBulkSelection";

export function useWeeklyBulkSelection(receipts: ReceiptItem[], weekStartDate: string) {
  return useSpendingBulkSelection(receipts, weekStartDate);
}
