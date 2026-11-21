import { buildInvitationFallbackUrl as buildInvitationFallbackUrlDomain } from "../../../../lib/domain/groups/clerkInvitations";

export type ClerkSignUpResult = {
  error?: unknown;
  missingFields?: string[];
  status?: string | null;
};

type ClerkSsoResult = {
  error?: unknown;
};

export type ClerkSignUp = ClerkSignUpResult & {
  sso: (params: {
    redirectCallbackUrl: string;
    redirectUrl: string;
    strategy: "oauth_google";
  }) => Promise<ClerkSignUpResult>;
  finalize: (params: {
    navigate: (params: { decorateUrl: (url: string) => string }) => void;
  }) => Promise<{ error?: unknown }>;
  ticket: (params: { ticket: string }) => Promise<ClerkSignUpResult>;
  update: (params: { firstName?: string; lastName?: string }) => Promise<ClerkSignUpResult>;
};

export type ClerkSignIn = {
  sso: (params: {
    redirectCallbackUrl: string;
    redirectUrl: string;
    strategy: "oauth_google";
  }) => Promise<ClerkSsoResult>;
};

export const CLERK_STATUS_SIGN_IN = "sign_in";

export const firstNameFieldNames = new Set(["firstName", "first_name"]);
export const lastNameFieldNames = new Set(["lastName", "last_name"]);
const passwordFieldNames = new Set(["password"]);

export function getMissingFields(
  signUpResult: ClerkSignUpResult | undefined,
  signUp: ClerkSignUpResult,
) {
  return signUpResult?.missingFields ?? signUp.missingFields ?? [];
}

export function hasSupportedProfileFields(fields: string[]) {
  return fields.some((field) => firstNameFieldNames.has(field) || lastNameFieldNames.has(field));
}

export function hasPasswordField(fields: string[]) {
  return fields.some((field) => passwordFieldNames.has(field));
}

export function collectClerkErrorMessages(error: unknown) {
  if (typeof error === "string") {
    return [error];
  }

  if (!error || typeof error !== "object") {
    return [];
  }

  const messages: string[] = [];
  const maybeError = error as {
    errors?: unknown;
    longMessage?: unknown;
    message?: unknown;
  };
  if (typeof maybeError.message === "string") {
    messages.push(maybeError.message);
  }
  if (typeof maybeError.longMessage === "string") {
    messages.push(maybeError.longMessage);
  }
  if (Array.isArray(maybeError.errors)) {
    for (const item of maybeError.errors) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const clerkError = item as { code?: unknown; longMessage?: unknown; message?: unknown };
      if (typeof clerkError.code === "string") {
        messages.push(clerkError.code);
      }
      if (typeof clerkError.message === "string") {
        messages.push(clerkError.message);
      }
      if (typeof clerkError.longMessage === "string") {
        messages.push(clerkError.longMessage);
      }
    }
  }

  return messages;
}

export function isExistingAccountInvitationError(error: unknown) {
  const message = collectClerkErrorMessages(error).join(" ").toLowerCase();
  return message.includes("account already exists") && message.includes("sign in");
}

export function buildInvitationFallbackUrl(token: string | null) {
  return buildInvitationFallbackUrlDomain(token);
}
