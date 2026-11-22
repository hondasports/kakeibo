/** 履歴複写・お気に入りからの入力フォーム初期値。 */
export type ExpenseEntryPrefill = {
  title: string;
  amountYen: number;
  categoryId: string;
  memo?: string;
};
