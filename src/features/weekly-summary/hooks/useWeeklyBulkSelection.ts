import { useMemo, useState } from "react";
import {
  MAX_BULK_SPENDING_SELECTION,
  canSelectAnotherSpendingRecord,
  getBulkSpendingLimitErrorMessage,
} from "../../../../lib/convex/spending/bulkOps";
import type { ReceiptItem } from "../../summary-shared/types/types";
import {
  getSpendingSelectionKey,
  getVisibleSelectableReceipts,
  partitionSelectedSpendingIds,
  pruneSelectionToVisibleKeys,
  takeKeysUpToLimit,
  type SpendingSelectionKey,
} from "../../summary-shared/utils/bulkSelection";

export function useWeeklyBulkSelection(receipts: ReceiptItem[], weekStartDate: string) {
  const [selectedKeys, setSelectedKeys] = useState<Set<SpendingSelectionKey>>(new Set());
  const [limitMessage, setLimitMessage] = useState("");

  const selectableReceipts = useMemo(() => getVisibleSelectableReceipts(receipts), [receipts]);
  const selectableKeys = useMemo(
    () => selectableReceipts.map(getSpendingSelectionKey),
    [selectableReceipts],
  );

  const [prevWeekStartDate, setPrevWeekStartDate] = useState(weekStartDate);
  if (prevWeekStartDate !== weekStartDate) {
    setPrevWeekStartDate(weekStartDate);
    setSelectedKeys(new Set());
    setLimitMessage("");
  }

  const [prevSelectableKeys, setPrevSelectableKeys] = useState(selectableKeys);
  if (prevSelectableKeys !== selectableKeys) {
    setPrevSelectableKeys(selectableKeys);
    setSelectedKeys((current) => pruneSelectionToVisibleKeys(current, selectableKeys));
  }

  const selectedReceipts = useMemo(
    () =>
      selectableReceipts.filter((receipt) => selectedKeys.has(getSpendingSelectionKey(receipt))),
    [selectableReceipts, selectedKeys],
  );

  const selectedCount = selectedReceipts.length;
  const selectedIds = useMemo(() => partitionSelectedSpendingIds(selectedKeys), [selectedKeys]);

  const toggleReceipt = (receipt: ReceiptItem, checked: boolean) => {
    const key = getSpendingSelectionKey(receipt);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (!checked) {
        next.delete(key);
        setLimitMessage("");
        return next;
      }
      if (next.has(key)) {
        return next;
      }
      if (!canSelectAnotherSpendingRecord(next.size)) {
        setLimitMessage(getBulkSpendingLimitErrorMessage());
        return next;
      }
      next.add(key);
      setLimitMessage("");
      return next;
    });
  };

  const selectVisible = (visibleReceipts: ReceiptItem[]) => {
    const visibleKeys = getVisibleSelectableReceipts(visibleReceipts).map(getSpendingSelectionKey);
    const remaining = MAX_BULK_SPENDING_SELECTION - selectedKeys.size;
    const unselected = visibleKeys.filter((key) => !selectedKeys.has(key));
    const { nextKeys, capped } = takeKeysUpToLimit(unselected, remaining);
    setSelectedKeys((current) => new Set([...current, ...nextKeys]));
    setLimitMessage(capped ? getBulkSpendingLimitErrorMessage() : "");
  };

  const deselectVisible = (visibleReceipts: ReceiptItem[]) => {
    const visibleKeys = new Set(
      getVisibleSelectableReceipts(visibleReceipts).map(getSpendingSelectionKey),
    );
    setSelectedKeys(
      (current) => new Set(Array.from(current).filter((key) => !visibleKeys.has(key))),
    );
    setLimitMessage("");
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setLimitMessage("");
  };

  const isSelected = (receipt: ReceiptItem) => selectedKeys.has(getSpendingSelectionKey(receipt));

  return {
    selectedCount,
    selectedReceipts,
    selectedIds,
    limitMessage,
    isSelected,
    toggleReceipt,
    selectVisible,
    deselectVisible,
    clearSelection,
  };
}
