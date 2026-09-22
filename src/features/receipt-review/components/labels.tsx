import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import HelpIcon from "@mui/icons-material/Help";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import type { AiExpenseQueueDocumentType } from "../types/types";
import type { AiExpenseQueueStatus, QueueSectionKey } from "../../../types/aiExpenseQueue";
export { getReviewReasonLabel } from "../utils/reviewFeedback";

export const statusLabels: Record<AiExpenseQueueStatus, string> = {
  adding: "追加中",
  queued: "解析待ち",
  analyzing: "解析中",
  ready: "登録できます",
  needs_review: "確認待ち",
  failed: "読み取り失敗",
  registering: "登録中",
  registered: "登録済み",
};

export type DisplayQueueStatus = "needs_review" | "ready" | "processing" | "failed" | "registered";

export const displayStatusLabels: Record<DisplayQueueStatus, string> = {
  needs_review: "確認待ち",
  ready: "登録できます",
  processing: "読み取り中",
  failed: "読み取り失敗",
  registered: "登録済み",
};

export function getDisplayStatus(status: AiExpenseQueueStatus): DisplayQueueStatus {
  if (status === "ready" || status === "registering") {
    return "ready";
  }
  if (status === "needs_review") {
    return "needs_review";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "registered") {
    return "registered";
  }
  return "processing";
}

export const documentTypeLabels: Record<AiExpenseQueueDocumentType, string> = {
  receipt: "レシート",
  convenience_payment: "払込票",
  unknown: "種別未判定",
};

export const reviewDocumentTypeOptions = Object.entries(documentTypeLabels).filter(
  ([value]) => value !== "unknown",
);

export function getSectionKey(status: AiExpenseQueueStatus): QueueSectionKey {
  if (status === "ready" || status === "registering") {
    return "ready";
  }
  if (status === "needs_review") {
    return "needs_review";
  }
  if (status === "failed") {
    return "failed";
  }
  if (status === "registered") {
    return "registered";
  }
  return "processing";
}

export const queueSectionLabels: Record<QueueSectionKey, string> = {
  processing: "読み取り中",
  ready: "登録できます",
  needs_review: "確認待ち",
  failed: "読み取り失敗",
  registered: "登録済み",
};

export const queueSectionDescriptions: Partial<Record<QueueSectionKey, string>> = {
  processing: "",
};

export function getStatusIcon(status: AiExpenseQueueStatus) {
  if (status === "ready" || status === "registered") {
    return <CheckCircleIcon fontSize="small" />;
  }
  if (status === "needs_review") {
    return <HelpIcon fontSize="small" />;
  }
  if (status === "failed") {
    return <ErrorOutlinedIcon fontSize="small" />;
  }
  return <HourglassEmptyIcon fontSize="small" />;
}

export function getStatusColor(status: AiExpenseQueueStatus) {
  if (status === "ready" || status === "registered") {
    return "success" as const;
  }
  if (status === "needs_review") {
    return "warning" as const;
  }
  if (status === "failed") {
    return "error" as const;
  }
  return "default" as const;
}
