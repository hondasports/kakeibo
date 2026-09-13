/**
 * groupDeletionNotificationRecipients のポート（domain interface）。
 * 通知先スナップショットの作成・通知済みマーク・後掃除を抽象化する。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */

/** 通知イベント種別（started=削除開始通知 / completed=削除完了通知）。 */
export type GroupDeletionNotificationEvent = "started" | "completed";

export type GroupDeletionRecipientRecord = {
  id: string;
  jobId: string;
  recipientUserId: string;
  startedHandledAt?: number;
  completedHandledAt?: number;
  createdAt: number;
  updatedAt: number;
};

/** ページネーション結果（groupMembers スキャン用）。 */
export type MemberPage = {
  page: { userId: string }[];
  isDone: boolean;
  continueCursor: string;
};

export interface GroupDeletionRecipientStore {
  /** groupMembers をページネーションで走査する（recipient snapshot 用）。 */
  paginateGroupMembers(groupId: string, cursor: string | null, limit: number): Promise<MemberPage>;
  /** 同じ受信者のスナップショットが既に存在するか（dedupe）。 */
  findRecipient(
    jobId: string,
    recipientUserId: string,
  ): Promise<GroupDeletionRecipientRecord | null>;
  /** 受信者スナップショットを作成する。 */
  insertRecipient(fields: {
    jobId: string;
    recipientUserId: string;
    createdAt: number;
    updatedAt: number;
  }): Promise<string>;
  /** 指定イベント未処理の受信者を limit 件取得する。 */
  listUnnotified(
    jobId: string,
    event: GroupDeletionNotificationEvent,
    limit: number,
  ): Promise<GroupDeletionRecipientRecord[]>;
  /** 受信者のイベント処理済みマークを付ける。 */
  markHandled(
    recipientId: string,
    event: GroupDeletionNotificationEvent,
    handledAt: number,
  ): Promise<void>;
  /** 受信者スナップショットを先頭から limit 件取得する（cleanup 用）。 */
  takeRecipients(jobId: string, limit: number): Promise<GroupDeletionRecipientRecord[]>;
  /** 受信者スナップショットを削除する。 */
  deleteRecipient(recipientId: string): Promise<void>;
}
