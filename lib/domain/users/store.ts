/**
 * users endpoint 用ストアのポート（domain interface）。
 * 実装は infrastructure 層（lib/convex）が提供する。
 */

/** endpoint 操作で往復するユーザーの完全形状。 */
export type UserRecord = {
  id: string;
  creationTime: number;
  userId: string;
  displayName: string;
  email?: string;
  activeGroupId?: string;
  monthlyIncome?: number;
  weeklyStartDay?: number;
  weeklyEndDay?: number;
  receiptImageExternalApiConsentAcceptedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type NewUserFields = {
  userId: string;
  displayName: string;
  email?: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * users の patch。Convex では undefined を渡すとフィールドが削除されるため、
 * monthlyIncome 等は `| undefined` を明示してクリア操作を表現する。
 */
export type UserPatch = {
  displayName?: string;
  email?: string;
  monthlyIncome?: number | undefined;
  weeklyStartDay?: number;
  weeklyEndDay?: number;
  receiptImageExternalApiConsentAcceptedAt?: number;
  updatedAt: number;
};

export interface UserStore {
  /** tokenIdentifier（=userId）で一意検索する。存在しなければ null。 */
  findByUserId(userId: string): Promise<UserRecord | null>;
  /** 正規化済み email で一意検索する。存在しなければ null。 */
  findByEmail(email: string): Promise<UserRecord | null>;
  insert(fields: NewUserFields): Promise<string>;
  patch(id: string, patch: UserPatch): Promise<void>;
}
