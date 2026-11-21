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
  // 支出全体のメモは明細（items）とは別のフォーム状態として持つ。
  // 明細行の増減で値が失われないようにするため（#1346）。
  const [memo, setMemoState] = useState("");
  const [memoError, setMemoError] = useState("");

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
    // 既存の入力内容を最初の項目として引き継ぐ（カテゴリは単一モードの選択を維持。
    // メモは支出全体のフォーム状態に保持されるため明細には入れない）
    setItems([
      {
        categoryId: resolveEntryCategoryId(items[0]?.categoryId, categories),
        amountYen: "",
        title: shopName,
        memo: "",
      },
    ]);
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
    setMemoState("");
    setMemoError("");
    setItems([{ categoryId: carriedCategoryId, amountYen: "", title: "", memo: "" }]);
    setItemErrors([{}]);
    setIsMultiMode(false);
  };

  // 複数項目モード → 単一モードへ戻る。店名・日付・メモは引き継ぎ、
  // 金額は明細合計を入れる（明細が未入力なら既存の合計金額を保持）
  const [showExitMultiConfirm, setShowExitMultiConfirm] = useState(false);

  const hasItemInput = (item: ExpenseItemState) =>
    item.amountYen.trim() !== "" || item.title.trim() !== "" || item.memo.trim() !== "";

  const exitMultiMode = () => {
    const totalAmount = items.reduce(
      (sum, item) => sum + (parseInt(item.amountYen || "0", 10) || 0),
      0,
    );
    const firstItem = items[0];
    setSourceAmountState(totalAmount > 0 ? String(totalAmount) : sourceAmount);
    setItems([
      {
        categoryId: resolveEntryCategoryId(firstItem?.categoryId, categories),
        amountYen: "",
        title: "",
        memo: "",
      },
    ]);
    setItemErrors([{}]);
    setIsMultiMode(false);
  };

  const handleExitMultiMode = () => {
    // 入力済みの明細が2件以上あるときだけ、内訳が破棄されることを確認する
    if (items.filter(hasItemInput).length >= 2) {
      setShowExitMultiConfirm(true);
      return;
    }
    exitMultiMode();
  };

  const handleConfirmExitMultiMode = () => {
    setShowExitMultiConfirm(false);
    exitMultiMode();
  };

  const handleCancelExitMultiMode = () => {
    setShowExitMultiConfirm(false);
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
    memo,
    memoError,
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
    setMemo: (v: string) => {
      setMemoState(v);
      setMemoError("");
    },
    setMemoError,
    setDate,
    setShopNameError,
    setSourceAmountError,
    setItemErrors,
    handleEnterMultiMode,
    handleAddItem,
    handleRemoveItem,
    handleItemChange,
    showExitMultiConfirm,
    handleExitMultiMode,
    handleConfirmExitMultiMode,
    handleCancelExitMultiMode,
    resetAfterSave,
  };
}
