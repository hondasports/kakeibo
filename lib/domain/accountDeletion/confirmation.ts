const ACCOUNT_DELETION_CONFIRMATION_TEXT = "削除";

export function isValidAccountDeletionConfirmation(text: string): boolean {
  return text === ACCOUNT_DELETION_CONFIRMATION_TEXT;
}
