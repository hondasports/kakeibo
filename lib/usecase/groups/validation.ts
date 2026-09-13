/**
 * groups ユースケース共通のドメイン検証→ConvexError 変換。
 * 既存 presentation 側 shim（convex/groups/lib/*）と同一のメッセージを維持する。
 */
import { ConvexError } from "convex/values";
import { MAX_GROUP_NAME_LENGTH, validateGroupName } from "../../domain/groups/groupName";
import { assertGroupNotDeleted } from "../../domain/groups/lifecycle";
import type { GroupWithLifecycleStatus } from "../../domain/groups/lifecycle";
import { validateEmail } from "../../domain/groups/email";
import { GROUP_ADMIN_ERROR_MESSAGES } from "./groupAdminErrors";

export function normalizeGroupNameOrThrow(name: string): string {
  const result = validateGroupName(name);
  if (!result.success) {
    if (result.error.type === "empty") {
      throw new ConvexError("グループ名を入力してください");
    }
    throw new ConvexError(`グループ名は${MAX_GROUP_NAME_LENGTH}文字以内で入力してください`);
  }
  return result.name;
}

export function normalizeEmailOrThrow(email: string): string {
  const result = validateEmail(email);
  if (!result.success) {
    throw new ConvexError("メールアドレスを入力してください");
  }
  return result.email;
}

export function assertGroupNotDeletedOrThrow(group: GroupWithLifecycleStatus): void {
  const result = assertGroupNotDeleted(group);
  if (!result.success) {
    throw new ConvexError(GROUP_ADMIN_ERROR_MESSAGES.GROUP_DELETED);
  }
}
