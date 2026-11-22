/**
 * /admin 画面で使う内部値の日本語表示ラベル。
 * Chip・フィルタ・詳細画面で同じ訳語を使うための正本。
 * ここにない値は raw 値をそのまま返す（未知の状態を隠さない）。
 */
export const groupStatusLabels: Record<string, string> = {
  active: "有効",
  deleting: "削除中",
  deleted: "削除済み",
  archived: "アーカイブ済み",
};

export const systemAdminStatusLabels: Record<string, string> = {
  active: "有効",
  revoked: "剥奪済み",
};

export const auditResultLabels: Record<string, string> = {
  success: "成功",
  denied: "拒否",
};

export const groupRoleLabels: Record<string, string> = {
  owner: "オーナー",
  member: "メンバー",
};

export const membershipStatusLabels: Record<string, string> = {
  none: "なし",
  member: "メンバー",
  owner: "オーナー",
};

export const deletionJobStatusLabels: Record<string, string> = {
  requested: "受付済み",
  running: "実行中",
  retry_wait: "再試行待ち",
  failed: "失敗",
  completed: "完了",
};

export const invitationStatusLabels: Record<string, string> = {
  pending: "保留中",
  accepted: "受諾済み",
  expired: "期限切れ",
  revoked: "取消済み",
};

export function displayLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}
