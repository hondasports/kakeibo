import type { AiExpenseQueueItem } from "../types/aiExpenseQueue";

export const devAiExpenseQueueItems: AiExpenseQueueItem[] = [
  {
    id: "e2e-ready-draft",
    fileName: "ready-receipt.png",
    status: "ready",
    documentType: "receipt",
    title: "スーパー北浜",
    amountYen: 4280,
    date: "2026-06-08",
    categoryName: "食費",
  },
  {
    id: "e2e-review-draft",
    fileName: "review-payment.png",
    status: "needs_review",
    documentType: "convenience_payment",
    title: "公共料金",
    reviewReasons: ["low_confidence", "missing_required_field", "ambiguous_category"],
    date: "2026-06-01",
    categoryName: "水道光熱費",
  },

  {
    id: "e2e-failed-draft",
    fileName: "failed-receipt.png",
    status: "failed",
    documentType: "unknown",
    title: "読み取り失敗",
    reviewReasons: ["parse_failed"],
  },
  {
    id: "e2e-registered-draft",
    fileName: "17824771095466150171181650108301.jpg",
    status: "registered",
    documentType: "receipt",
    title: "ジャパン 明石稲美店",
    amountYen: 235,
    date: "2026-06-26",
    categoryName: "日用品",
  },
];

/** totalOnly 確認用の追加fixture。`?totalOnly=1` 指定時のみキューへ混ぜる */
export const devAiExpenseTotalOnlyQueueItem: AiExpenseQueueItem = {
  id: "e2e-totalonly-draft",
  fileName: "review-totalonly.png",
  status: "needs_review",
  documentType: "receipt",
  title: "E2E合計のみ店",
  reviewReasons: ["user_confirmation_required"],
  amountYen: 108,
  date: "2026-07-04",
  categoryName: "食費",
  registrationMode: "totalOnly",
};

export const devAiExpenseQueueCategories = [
  { _id: "e2e-cat-utilities", name: "水道光熱費", color: "#AAB7C4" },
  { _id: "e2e-cat-food", name: "食費", color: "#A6B28B" },
];

export const devAiExpenseReviewDrafts = {
  "e2e-review-draft": {
    _id: "e2e-review-draft",
    status: "needs_review" as const,
    documentType: "convenience_payment" as const,
    shopName: "",
    paymentPlace: "セブンイレブン北浜店",
    payeeName: "大阪市水道局",
    paymentPurpose: "",
    date: "2026-06-01",
    amountYen: 9120,
    categoryId: "e2e-cat-utilities",
    reviewReasons: ["low_confidence", "missing_required_field"],
    warnings: ["支払内容の印字が薄いため確認してください"],
    rawObservation: {
      source: "ai_ocr" as const,
      observedAt: 1,
      lines: [
        {
          rawText: "大阪市水道局 水道料金",
          amountText: "9,120円",
          amountYen: 9120,
          lineRoleCandidates: ["total" as const],
          roleConfidence: 0.88,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
        },
      ],
    },
  },
  "e2e-totalonly-draft": {
    _id: "e2e-totalonly-draft",
    status: "needs_review" as const,
    documentType: "receipt" as const,
    shopName: "E2E合計のみ店",
    paymentPlace: "",
    payeeName: "",
    paymentPurpose: "",
    date: "2026-07-04",
    amountYen: 108,
    categoryId: "e2e-cat-food",
    registrationMode: "totalOnly" as const,
    reviewReasons: ["user_confirmation_required"],
    warnings: [],
    rawObservation: {
      source: "ai_ocr" as const,
      observedAt: 1,
      lines: [
        {
          rawText: "E2E合計のみ商品 108円",
          amountText: "108円",
          amountYen: 108,
          lineRoleCandidates: ["item" as const],
          roleConfidence: 0.95,
          explicitlyPrinted: true,
          sourceLineIndex: 0,
        },
      ],
    },
  },
};

export const devAiExpenseReviewDraftItems = {
  "e2e-review-draft": [
    {
      _id: "e2e-item-food",
      itemName: "パン",
      amountYen: 120,
      categoryId: "e2e-cat-food",
      confidence: { itemName: 0.92, amountYen: 0.95, categoryId: 0.86 },
      warnings: [],
    },
    {
      _id: "e2e-item-unknown",
      itemName: "胃薬",
      amountYen: 980,
      confidence: { itemName: 0.72, amountYen: 0.95, categoryName: 0.4 },
      warnings: ["品名が不鮮明です"],
    },
  ],
  "e2e-totalonly-draft": [
    {
      _id: "e2e-item-totalonly",
      itemName: "E2E合計のみ商品",
      amountYen: 108,
      printedAmountYen: 108,
      categoryId: "e2e-cat-food",
      confidence: { itemName: 0.95, amountYen: 0.95, categoryId: 0.95 },
      warnings: [],
      taxResolutionStatus: "unresolved" as const,
    },
  ],
};
