import { resolveReceiptShopNameFromDraft, type ReceiptShopNameDraftFields } from "./shopName";

export type DraftTitleInput = ReceiptShopNameDraftFields;

export function getDraftTitle(draft: DraftTitleInput, fallback = "AI支出下書き"): string {
  return resolveReceiptShopNameFromDraft(draft, fallback);
}
