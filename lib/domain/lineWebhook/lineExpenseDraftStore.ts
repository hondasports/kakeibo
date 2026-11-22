/**
 * LINEテキスト入力から作成する支出下書きの書き込み口。
 * claim mutation 内で下書き＋明細を同一書き込みとして作成する。
 */
export type LineExpenseDraftInsert = {
  groupId: string;
  createdByUserId: string;
  title: string;
  amountYen: number;
  categoryId?: string;
  date: string;
  now: number;
};

export type LineExpenseDraftStore = {
  createFromLineText(args: LineExpenseDraftInsert): Promise<void>;
};
