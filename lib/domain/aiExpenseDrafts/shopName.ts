import type { AiExpenseDraftDocumentType } from "./constants";

export type ReceiptShopNameDraftFields = {
  documentType?: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
};

function joinNonEmpty(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ");
}

export function resolveReceiptShopNameFromDraft(
  draft: ReceiptShopNameDraftFields,
  fallback = "不明",
) {
  if (draft.documentType === "convenience_payment") {
    return (
      joinNonEmpty([draft.payeeName, draft.paymentPurpose]) ||
      draft.paymentPlace?.trim() ||
      draft.shopName?.trim() ||
      fallback
    );
  }

  return (
    draft.shopName?.trim() || draft.payeeName?.trim() || draft.paymentPlace?.trim() || fallback
  );
}
