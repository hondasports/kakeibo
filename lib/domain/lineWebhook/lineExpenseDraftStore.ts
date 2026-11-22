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

/** LINEテキスト下書きの1人あたりの日次上限（JSTの暦日で数える）。 */
export const LINE_TEXT_DRAFT_DAILY_LIMIT = 30;

export type LineExpenseDraftReader = {
  /**
   * sinceMs 以降に同じユーザーが作成した line_text 下書きの createdAt
   * （新しい順・最大 LINE_TEXT_DRAFT_DAILY_LIMIT + 1 件）。日次上限の判定用。
   */
  lineTextDraftCreatedAtsSince(createdByUserId: string, sinceMs: number): Promise<number[]>;
};

export type LineExpenseDraftStore = LineExpenseDraftReader & {
  createFromLineText(args: LineExpenseDraftInsert): Promise<void>;
};
