/**
 * グループ管理系エラーメッセージの共有定数。
 * convex/groups/adminGuards.ts の GROUP_ADMIN_ERRORS と同一文言を維持する。
 */
export const GROUP_ADMIN_ERROR_MESSAGES = {
  OWNER_ONLY: "グループオーナーのみ実行できます",
  NOT_ACTIVE_GROUP: "現在選択中のグループでのみ実行できます",
  SELF_OPERATION_FORBIDDEN: "自分自身に対してこの操作はできません",
  OWNER_MEMBER_NOT_REMOVABLE: "オーナーはグループから外せません",
  LAST_OWNER_PROTECTED: "最後のオーナーは変更できません",
  TRANSFER_TARGET_MUST_BE_MEMBER: "譲渡先はメンバーロールのユーザーに限定されます",
  GROUP_DELETED: "削除済みのグループにはアクセスできません",
  GROUP_DELETING: "このグループは削除処理中です",
  GROUP_ALREADY_DELETED: "このグループはすでに削除されています",
  GROUP_NAME_MISMATCH: "入力されたグループ名が一致しません",
} as const;
