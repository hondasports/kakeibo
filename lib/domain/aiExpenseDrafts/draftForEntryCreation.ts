/**
 * expenseEntries 作成ユースケースが必要とする下書きの読み取りポート。
 * aiExpenseDrafts 集約のうち、エントリ作成に必要な最小限だけを公開する。
 */

/** エントリ作成に必要な下書きの最小形状。 */
export type DraftForEntryCreation = {
  id: string;
  groupId: string;
  status: string;
  date?: string;
  categoryId?: string;
};

export interface AiExpenseDraftReader {
  /** ID で取得する。存在しなければ null。 */
  findById(id: string): Promise<DraftForEntryCreation | null>;
}
