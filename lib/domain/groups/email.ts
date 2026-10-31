import { normalizeEmail } from "../users/email";

export type ValidateEmailError = "empty";

export function validateEmail(
  email: string,
): { success: true; email: string } | { success: false; error: ValidateEmailError } {
  const normalized = normalizeEmail(email);
  if (normalized === undefined) {
    return { success: false, error: "empty" };
  }
  return { success: true, email: normalized };
}

/** メールアドレスの最大長（RFC 5321 の forward-path 上限）。 */
export const MAX_EMAIL_LENGTH = 254;
/** ローカル部の最大長（RFC 5321）。 */
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
/** 保守的な形式: @ はちょうど 1 つ、空白なし、ドメインは「.」区切りで 2 ラベル以上。 */
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export type ValidateInvitationEmailError = ValidateEmailError | "too_long" | "invalid_format";

/**
 * 招待・メンバー追加で受け付けるメールアドレスの検証。
 * ネットワークを使わず、長さと形式だけを検査する（Clerk への送信前に弾くため）。
 * 既存データ照合用の validateEmail とは分け、Gmail 正規化・照合には影響させない。
 */
export function validateInvitationEmail(
  email: string,
): { success: true; email: string } | { success: false; error: ValidateInvitationEmailError } {
  const result = validateEmail(email);
  if (!result.success) {
    return result;
  }
  if (result.email.length > MAX_EMAIL_LENGTH) {
    return { success: false, error: "too_long" };
  }
  const localPart = result.email.slice(0, result.email.indexOf("@"));
  if (!EMAIL_FORMAT_PATTERN.test(result.email) || localPart.length > MAX_EMAIL_LOCAL_PART_LENGTH) {
    return { success: false, error: "invalid_format" };
  }
  return result;
}

export function normalizeGmailAddress(email: string): string | null {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return null;
  }

  const normalizedDomain = domain === "googlemail.com" ? "gmail.com" : domain;
  if (normalizedDomain !== "gmail.com") {
    return null;
  }

  const canonicalLocalPart = localPart.split("+")[0].replaceAll(".", "");
  return `${canonicalLocalPart}@${normalizedDomain}`;
}

export function getInvitationEmailKey(email: string): string {
  const normalized = normalizeEmail(email) ?? "";
  return normalizeGmailAddress(normalized) ?? normalized;
}

export type PendingInvitationLike = {
  email: string;
  createdAt: number;
};

export function sortPendingInvitationsByCreatedAtAndEmail<T extends PendingInvitationLike>(
  invitations: T[],
): T[] {
  return [...invitations].sort((left, right) => {
    const createdAtCompare = right.createdAt - left.createdAt;
    if (createdAtCompare !== 0) {
      return createdAtCompare;
    }
    return left.email.localeCompare(right.email, "ja");
  });
}

export function dedupePendingInvitationsByEmail<T extends PendingInvitationLike>(
  invitations: T[],
): T[] {
  const sorted = sortPendingInvitationsByCreatedAtAndEmail(invitations);
  const latestByEmail = new Map<string, T>();

  for (const invitation of sorted) {
    const key = getInvitationEmailKey(invitation.email);
    if (!latestByEmail.has(key)) {
      latestByEmail.set(key, invitation);
    }
  }

  return sortPendingInvitationsByCreatedAtAndEmail([...latestByEmail.values()]);
}

export function invitationEmailsMatch(
  identityEmail: string | undefined,
  invitationEmail: string,
): boolean {
  const normalizedIdentityEmail = normalizeEmail(identityEmail);
  const normalizedInvitationEmail = normalizeEmail(invitationEmail) ?? "";
  if (!normalizedIdentityEmail) {
    return false;
  }
  if (normalizedIdentityEmail === normalizedInvitationEmail) {
    return true;
  }

  const canonicalIdentityEmail = normalizeGmailAddress(normalizedIdentityEmail);
  const canonicalInvitationEmail = normalizeGmailAddress(normalizedInvitationEmail);
  return canonicalIdentityEmail !== null && canonicalIdentityEmail === canonicalInvitationEmail;
}

export function invitationEmailsMatchAny(
  candidateEmails: Array<string | undefined>,
  invitationEmail: string,
): boolean {
  return candidateEmails.some((email) => invitationEmailsMatch(email, invitationEmail));
}
