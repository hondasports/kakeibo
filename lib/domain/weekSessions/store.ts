/**
 * weekSessions endpoint 用ストアのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */

export type WeekSessionStatus = "draft" | "completed";

/** endpoint 操作で往復する週次セッションの完全形状。 */
export type WeekSessionRecord = {
  id: string;
  creationTime: number;
  groupId: string;
  weekStartDate: string;
  weekEndDate: string;
  reviewMemo?: string;
  status: WeekSessionStatus;
  createdAt: number;
  updatedAt: number;
};

export type NewWeekSessionFields = {
  groupId: string;
  weekStartDate: string;
  weekEndDate: string;
  status: WeekSessionStatus;
  createdAt: number;
  updatedAt: number;
};

/**
 * weekSessions の patch。Convex では undefined を渡すとフィールドが削除されるため、
 * reviewMemo は `| undefined` を明示してクリア操作を表現する。
 */
export type WeekSessionPatch = {
  status?: WeekSessionStatus;
  reviewMemo?: string | undefined;
  updatedAt: number;
};

export interface WeekSessionStore {
  /** groupId と weekStartDate で一意検索する。存在しなければ null。 */
  findByGroupAndWeekStart(
    groupId: string,
    weekStartDate: string,
  ): Promise<WeekSessionRecord | null>;
  /** id で取得する。存在しなければ null。 */
  get(id: string): Promise<WeekSessionRecord | null>;
  insert(fields: NewWeekSessionFields): Promise<string>;
  patch(id: string, patch: WeekSessionPatch): Promise<void>;
}
