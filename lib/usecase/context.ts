/**
 * ユースケース層の共通型。
 * presentation 層（convex/）で認証・グループ所属を解決した後の実行コンテキスト。
 */
export type UsecaseGroupContext = {
  groupId: string;
  userId: string;
};
