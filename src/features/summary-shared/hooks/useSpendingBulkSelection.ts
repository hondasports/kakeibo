import { useMemo, useState } from "react";
import {
  MAX_BULK_SPENDING_SELECTION,
  canSelectAnotherSpendingRecord,
  getBulkSpendingLimitErrorMessage,
} from "../../../../lib/domain/spending/bulkSpending";
import type { ReceiptItem } from "../types/types";
import {
  getSpendingSelectionKey,
  getVisibleSelectableReceipts,
  partitionSelectedSpendingIds,
  pruneSelectionToVisibleKeys,
  takeKeysUpToLimit,
  type SpendingSelectionKey,
} from "../utils/bulkSelection";

/**
 * 支出一覧の一括選択状態。
 * `resetKey` が変わると選択をクリアする（週次は週、検索は適用条件）。
 */
export function useSpendingBulkSelection(receipts: ReceiptItem[], resetKey: string) {
  const [selectedKeys, setSelectedKeys] = useState<Set<SpendingSelectionKey>>(new Set());
  const [limitMessage, setLimitMessage] = useState("");

  const selectableReceipts = useMemo(() => getVisibleSelectableReceipts(receipts), [receipts]);
  const selectableKeys = useMemo(
    () => selectableReceipts.map(getSpendingSelectionKey),
    [selectableReceipts],
  );

  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
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
