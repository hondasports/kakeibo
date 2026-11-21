import { useState } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getTodayDateStringInJapan } from "../../../../lib/domain/common/date";
import { getWeekEndDate } from "../../week";
import type { ExpenseItemEntryErrors } from "../validation/expenseItems";

export type ExpenseItemState = {
  categoryId: Id<"categories"> | "";
  amountYen: string;
  title: string;
  memo: string;
};

type EntryCategory = { _id: Id<"categories">; name: string; color: string };

type UseExpenseEntryModeArgs = {
  weekStartDate: string;
  categories: EntryCategory[];
};

/**
 * 日付の初期値を返す。表示週に今日（JST）が含まれれば今日、含まれなければ週初日
 * （docs/ui-ux-design.md §6.1）。
 */
export function resolveEntryDefaultDate(weekStartDate: string, todayDate?: string): string {
  const today = todayDate ?? getTodayDateStringInJapan();
  const weekEndDate = getWeekEndDate(weekStartDate);
  return weekStartDate <= today && today <= weekEndDate ? today : weekStartDate;
}

/**
 * カテゴリの初期値を返す。引き継ぎたいカテゴリが一覧にあればそれを、
 * 無ければ先頭カテゴリを返す（docs/ui-ux-design.md §6.4・§6.6）。
 */
function resolveEntryCategoryId(
  preferred: Id<"categories"> | "" | undefined,
  categories: EntryCategory[],
): Id<"categories"> | "" {
  if (preferred && categories.some((category) => category._id === preferred)) {
    return preferred;
  }
  return categories[0]?._id ?? "";
}

export function useExpenseEntryMode({ weekStartDate, categories }: UseExpenseEntryModeArgs) {
  const [shopName, setShopNameState] = useState("");
  const [sourceAmount, setSourceAmountState] = useState("");
  const [date, setDate] = useState(() => resolveEntryDefaultDate(weekStartDate));
  const [isMultiMode, setIsMultiMode] = useState(false);
  const [items, setItems] = useState<ExpenseItemState[]>([
    { categoryId: categories[0]?._id ?? "", amountYen: "", title: "", memo: "" },
  ]);
  const [shopNameError, setShopNameError] = useState("");
  const [sourceAmountError, setSourceAmountError] = useState("");
  const [itemErrors, setItemErrors] = useState<ExpenseItemEntryErrors[]>([{}]);

  // BUG#1: weekStartDate が変わったら date をリセット（WeekNavigator 週移動時のstale防止）
  const [prevWeekStartDate, setPrevWeekStartDate] = useState(weekStartDate);
  if (prevWeekStartDate !== weekStartDate) {
    setPrevWeekStartDate(weekStartDate);
    setDate(resolveEntryDefaultDate(weekStartDate));
  }

  // ANALYSIS#1: categories が非同期ロードされたとき items[0].categoryId を更新
  const [prevCategories, setPrevCategories] = useState(categories);
  if (prevCategories !== categories) {
    setPrevCategories(categories);
    const firstCategoryId = categories[0]?._id ?? "";
    if (firstCategoryId) {
      setItems((prev) =>
        prev.map((item, i) =>
          i === 0 && !categories.some((category) => category._id === item.categoryId)
            ? { ...item, categoryId: firstCategoryId }
            : item,
        ),
      );
    }
  }

  // 単一モードの差額計算 (入力した合計金額 vs items[0].amountYen)
  const singleAmountNum = parseInt(items[0]?.amountYen || "0", 10) || 0;
  const sourceAmountNum = parseInt(sourceAmount || "0", 10) || 0;

  // 複数モードの差額
  const totalItemAmount = items.reduce((sum, item) => {
    const n = parseInt(item.amountYen || "0", 10) || 0;
    return sum + n;
  }, 0);
  const difference = isMultiMode && sourceAmountNum > 0 ? sourceAmountNum - totalItemAmount : null;

  const handleEnterMultiMode = () => {
    if (!shopName.trim()) {
      setShopNameError("店舗名 / 支払先は必須です");
      return;
    }
    if (!sourceAmount || parseInt(sourceAmount, 10) <= 0) {
      setSourceAmountError("金額は必須です");
      return;
    }
    setIsMultiMode(true);
    // 既存の入力内容を最初の項目として引き継ぐ
    setItems([{ categoryId: categories[0]?._id ?? "", amountYen: "", title: shopName, memo: "" }]);
    setItemErrors([{}]);
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { categoryId: categories[0]?._id ?? "", amountYen: "", title: "", memo: "" },
    ]);
    setItemErrors((prev) => [...prev, {}]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setItemErrors((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ExpenseItemState, value: string) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    setItemErrors((prev) =>
      prev.map((err, i) => (i === index ? { ...err, [field]: undefined } : err)),
    );
  };

  const resetAfterSave = () => {
    // §6.6: 保存後はカテゴリを引き継ぐ。一覧に無い場合は先頭へフォールバック
    const carriedCategoryId = resolveEntryCategoryId(items[0]?.categoryId, categories);
    setShopNameState("");
    setSourceAmountState("");
    setItems([{ categoryId: carriedCategoryId, amountYen: "", title: "", memo: "" }]);
    setItemErrors([{}]);
    setIsMultiMode(false);
  };

  return {
    shopName,
    sourceAmount,
    date,
    isMultiMode,
    items,
    shopNameError,
    sourceAmountError,
    itemErrors,
    difference,
    singleAmountNum,
    sourceAmountNum,
    setShopName: (v: string) => {
      setShopNameState(v);
      if (v.trim()) setShopNameError("");
    },
    setSourceAmount: (v: string) => {
      setSourceAmountState(v);
      if (v && parseInt(v, 10) > 0) setSourceAmountError("");
    },
    setDate,
    setShopNameError,
    setSourceAmountError,
    setItemErrors,
    handleEnterMultiMode,
    handleAddItem,
    handleRemoveItem,
    handleItemChange,
    resetAfterSave,
  };
}
