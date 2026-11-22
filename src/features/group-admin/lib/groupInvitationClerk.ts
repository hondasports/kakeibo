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

/**
 * signUp.update のエラーから first_name / last_name 各フィールド向けの
 * メッセージを取り出す。paramName が一致しない項目は返さない（全体Alert側に委ねる）。
 */
export function extractProfileFieldErrors(error: unknown) {
  const result: { firstName?: string; lastName?: string } = {};
  if (!error || typeof error !== "object") {
    return result;
  }
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return result;
  }
  for (const item of errors) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const clerkError = item as {
      longMessage?: unknown;
      message?: unknown;
      meta?: { paramName?: unknown };
    };
    const paramName =
      typeof clerkError.meta?.paramName === "string" ? clerkError.meta.paramName : "";
    const rawMessage =
      typeof clerkError.longMessage === "string" && clerkError.longMessage !== ""
        ? clerkError.longMessage
        : typeof clerkError.message === "string" && clerkError.message !== ""
          ? clerkError.message
          : undefined;
    if (firstNameFieldNames.has(paramName)) {
      // Clerkの文言は英語のことが多いため、表示はアプリ側の文言に寄せる（生文言は開発時のみ）
      result.firstName =
        import.meta.env.DEV && rawMessage
          ? `名を確認してください（${rawMessage}）`
          : "名を確認してください";
    } else if (lastNameFieldNames.has(paramName)) {
      result.lastName =
        import.meta.env.DEV && rawMessage
          ? `姓を確認してください（${rawMessage}）`
          : "姓を確認してください";
    }
  }
  return result;
}
