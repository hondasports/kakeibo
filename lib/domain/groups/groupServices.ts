/**
 * groups ドメインのサービス・ポート（domain interface）。
 * メール通知キュー・アカウント削除ガード・招待クリーンアップなど、
 * 他ドメインや外部連携をまたぐ副作用の抽象。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */
import type { GroupRole } from "./role";

/** グループ管理イベントのメール通知キュー。 */
export interface GroupEmailNotificationQueue {
  membershipRemoved(args: { groupName: string; recipientEmail?: string }): Promise<void>;
  roleChanged(args: {
    groupName: string;
    previousRole: GroupRole;
    newRole: GroupRole;
    recipientEmail?: string;
  }): Promise<void>;
  ownershipReceived(args: { groupName: string; recipientEmail?: string }): Promise<void>;
  ownershipTransferred(args: {
    groupName: string;
    newOwnerDisplayName: string;
    recipientEmail?: string;
  }): Promise<void>;
  groupDeleted(args: {
    groupName: string;
    recipientEmail?: string;
    businessDedupeKey?: string;
  }): Promise<void>;
  deletionStarted(args: {
    groupName: string;
    recipientEmail?: string;
    businessDedupeKey: string;
  }): Promise<void>;
  deletionFailed(args: {
    groupName: string;
    jobId: string;
    recipientEmail?: string;
    businessDedupeKey: string;
  }): Promise<void>;
}

/** アカウント削除処理中かを検査するガード。進行中の場合はエラーを投げる。 */
export interface AccountDeletionGuard {
  assertNotInProgress(userId: string): Promise<void>;
}

/** オーナー遷移の不変条件ガード。最後のオーナーが残ることを検証し、違反時はエラーを投げる。 */
export interface GroupOwnerTransitionGuard {
  assertAnotherOwnerRemains(groupId: string, demotedMembershipId: string): Promise<void>;
}

/**
 * 招待の無効化ワークフロー。
 * 再招待前の stale 掃除と、pending 招待の明示的 revoke（Clerk 招待 ID の回収）を担う。
 */
export interface GroupInvitationCleanupService {
  /** 同一メールの古い pending と所属外の accepted を revoked にする。 */
  revokeForEmail(groupId: string, email: string): Promise<void>;
  /** グループ内の pending 招待を revoked にし、対象の Clerk 招待 ID を返す。 */
  revokePendingForEmail(groupId: string, email: string): Promise<string[]>;
}
