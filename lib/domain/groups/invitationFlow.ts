import { normalizeEmail } from "../users/email";
import { getGroupAdminErrorMessage, validateGroupOwnerRole } from "./admin";

export class ClerkInvitationDomainError extends Error {}

export type InvitationGroupRecord = {
  _id: string;
  name: string;
  clerkOrganizationId: string | null;
  role: "owner" | "member";
  createdAt: number;
};

/**
 * 招待操作の前提となるグループを検証する。
 * グループ未選択は「グループを選択してください」、非オーナーは owner_only 文言を投げる。
 */
export function requireInvitationGroup(group: InvitationGroupRecord | null): InvitationGroupRecord {
  if (!group) {
    throw new ClerkInvitationDomainError("グループを選択してください");
  }
  const roleResult = validateGroupOwnerRole(group.role);
  if (!roleResult.success) {
    throw new ClerkInvitationDomainError(getGroupAdminErrorMessage(roleResult.error));
  }
  return group;
}

/** 招待メールアドレスを正規化する。空・空白のみは「メールアドレスを入力してください」を投げる。 */
export function resolveInvitationEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (normalized === undefined) {
    throw new ClerkInvitationDomainError("メールアドレスを入力してください");
  }
  return normalized;
}

export type GroupInvitationRecordInput = {
  groupId: string;
  email: string;
  token: string;
  invitedByUserId: string;
  clerkInvitationId?: string;
};

/** groupInvitations への insert/追記に使う入力を構築する。 */
export function buildGroupInvitationRecordInput(input: {
  groupId: string;
  email: string;
  token: string;
  invitedByUserId: string;
  clerkInvitationId?: string;
}): GroupInvitationRecordInput {
  const record: GroupInvitationRecordInput = {
    groupId: input.groupId,
    email: input.email,
    token: input.token,
    invitedByUserId: input.invitedByUserId,
  };
  if (input.clerkInvitationId !== undefined) {
    record.clerkInvitationId = input.clerkInvitationId;
  }
  return record;
}
