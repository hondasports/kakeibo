import { normalizeEmail } from "./email";

export type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
  verification: { status?: string } | null;
};

export type ClerkUserWithEmails = {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: ClerkEmailAddress[];
  primaryEmailAddressId?: string | null;
};

export function getVerifiedClerkEmailAddresses(user: ClerkUserWithEmails): string[] {
  return (user.emailAddresses ?? [])
    .filter((email) => email.verification?.status === "verified")
    .map((email) => normalizeEmail(email.emailAddress))
    .filter((email): email is string => email !== undefined);
}

export function getClerkUserDisplayName(user: ClerkUserWithEmails, fallbackEmail?: string): string {
  const username = user.username?.trim();
  const displayName = [user.firstName, user.lastName]
    .map((name) => name?.trim())
    .filter(Boolean)
    .join(" ");
  return username || displayName || fallbackEmail || "ユーザー";
}

export function getPrimaryVerifiedClerkEmailAddress(user: ClerkUserWithEmails): string | undefined {
  const verifiedEmails = getVerifiedClerkEmailAddresses(user);
  const primaryEmail = (user.emailAddresses ?? []).find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  const normalizedPrimaryEmail = normalizeEmail(primaryEmail?.emailAddress);
  if (primaryEmail?.verification?.status === "verified" && normalizedPrimaryEmail !== undefined) {
    return normalizedPrimaryEmail;
  }
  return verifiedEmails[0];
}
