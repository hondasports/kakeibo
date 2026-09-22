import { vi } from "vitest";
import type { AiExpenseQueueItem } from "../../../types/aiExpenseQueue";

export const categories = [
  { _id: "cat-food", name: "食費", color: "#AAB7C4" },
  { _id: "cat-daily", name: "日用品", color: "#A6B28B" },
];

export const queueItems: AiExpenseQueueItem[] = [
  {
    id: "draft-ready",
    fileName: "ok-receipt.png",
    status: "ready",
    documentType: "receipt",
    title: "スーパー北浜",
    amountYen: 4280,
    date: "2026-05-18",
    categoryName: "食費",
  },
  {
    id: "draft-review",
    fileName: "review-payment.png",
    status: "needs_review",
    documentType: "convenience_payment",
    title: "公共料金",
    amountYen: 9120,
    date: "2026-05-19",
    categoryName: "公共料金",
    reviewReasons: ["low_confidence", "missing_required_field"],
  },
  {
    id: "draft-failed",
    fileName: "failed-receipt.png",
    status: "failed",
    documentType: "unknown",
    title: "読み取り失敗",
    date: "2026-05-19",
    categoryName: "不明",
    reviewReasons: ["parse_failed"],
  },
  {
    id: "draft-registering",
    fileName: "registering-receipt.png",
    status: "registering",
    documentType: "receipt",
    title: "登録中レシート",
    amountYen: 1200,
    date: "2026-05-20",
    categoryName: "食費",
  },
  {
    id: "draft-registered",
    fileName: "registered-receipt.png",
    status: "registered",
    documentType: "receipt",
    title: "登録済みレシート",
    amountYen: 1800,
    date: "2026-05-20",
    categoryName: "日用品",
  },
];

export function rejectImageDecoding() {
  return vi
    .spyOn(globalThis, "createImageBitmap")
    .mockRejectedValueOnce(new Error("画像をデコードできません"));
}
