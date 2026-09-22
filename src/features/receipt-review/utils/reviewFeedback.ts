const REVIEW_REASON_LABELS: Record<string, string> = {
  amount_mismatch: "金額・税内訳の確認が必要",
  ambiguous_category: "未分類あり",
  ambiguous_document_type: "書類種別要確認",
  cannot_reconcile_item_amounts: "商品合計とレシート小計が不一致",
  low_confidence: "読み取り内容の信頼度が低い",
  missing_required_field: "必須項目不足",
  multiple_categories: "複数カテゴリの確認",
  normalized_amount_mismatch: "お支払いと商品合計が不一致",
  parse_failed: "解析失敗",
  unresolved_amount_basis: "税込・税抜が未確定",
  unresolved_tax_rate: "税率未確定",
  user_confirmation_required: "内容確認が必要",
};

const REVIEW_REASON_PRIORITY = [
  "amount_mismatch",
  "normalized_amount_mismatch",
  "ambiguous_category",
  "missing_required_field",
  "unresolved_tax_rate",
  "unresolved_amount_basis",
  "cannot_reconcile_item_amounts",
  "ambiguous_document_type",
  "low_confidence",
  "multiple_categories",
  "user_confirmation_required",
  "parse_failed",
];

export function getReviewReasonLabel(reason: string): string {
  return REVIEW_REASON_LABELS[reason] ?? "分析結果に確認が必要な項目があります";
}

export function getPrimaryReviewReason(reasons: string[]): string | undefined {
  return [...reasons].sort((left, right) => {
    const leftIndex = REVIEW_REASON_PRIORITY.indexOf(left);
    const rightIndex = REVIEW_REASON_PRIORITY.indexOf(right);
    return (
      (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
    );
  })[0];
}

/** 編集中の明細分類を反映し、解消済みの未分類警告を表示対象から外す。 */
export function deriveVisibleReviewReasons(
  reasons: string[],
  items: Array<{ categoryId: string }>,
  receiptCategoryId: string,
): string[] {
  if (receiptCategoryId.trim() !== "" && items.every((item) => item.categoryId.trim() !== "")) {
    return reasons.filter((reason) => reason !== "ambiguous_category");
  }
  return reasons;
}

export function formatReviewSaveMessage(args: {
  status: "ready" | "needs_review" | "failed" | "registered";
  reviewReasons: string[];
  shopName?: string;
  amountYen?: number;
  categoryName?: string;
}): string {
  const subject = [
    args.shopName?.trim() || "レシート",
    args.amountYen !== undefined ? `${args.amountYen.toLocaleString("ja-JP")}円` : "金額未設定",
    args.categoryName || "カテゴリ未設定",
  ].join("・");

  if (args.status === "needs_review") {
    const primaryReason = getPrimaryReviewReason(args.reviewReasons);
    return [
      "保存しました。確認待ちに残っています。",
      primaryReason ? `確認ポイント：${getReviewReasonLabel(primaryReason)}` : undefined,
      subject,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return ["保存しました。登録できます。", subject].join("\n");
}
