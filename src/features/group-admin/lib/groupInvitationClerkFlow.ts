import {
  getMissingFields,
  hasPasswordField,
  hasSupportedProfileFields,
  isExistingAccountInvitationError,
  OAUTH_CALLBACK_PATH,
  type ClerkSignIn,
  type ClerkSignUp,
  type ClerkSignUpResult,
} from "./groupInvitationClerk";
import type { ClerkRequirementResolution } from "./groupInvitationAcceptState";

/**
 * Clerk の signUp/signIn session・ticket・SSO・finalize・redirect を扱う副作用。
 * Convex の preview/accept とは呼び出し境界を分け、呼び出し側の hook は
 * 戻り値の outcome だけを遷移へ渡す。
 */

export async function finalizeClerkSignUp(
  signUp: ClerkSignUp | undefined,
  fallbackUrl: string,
): Promise<boolean> {
  if (!signUp || signUp.status !== "complete") {
    return false;
  }

  const { error: finalizeError } = await signUp.finalize({
    navigate: ({ decorateUrl }) => {
      window.location.href = decorateUrl(fallbackUrl);
    },
  });
  if (finalizeError) {
    throw finalizeError;
  }
  return true;
}

export async function startGoogleSignInForInvitation(
  signIn: ClerkSignIn | undefined,
  fallbackUrl: string,
): Promise<void> {
  if (!signIn) {
    throw new Error("Clerk sign-in client is not loaded");
  }

  const ssoResult = await signIn.sso({
    redirectCallbackUrl: OAUTH_CALLBACK_PATH,
    redirectUrl: fallbackUrl,
    strategy: "oauth_google",
  });
  if (ssoResult.error) {
    throw ssoResult.error;
  }
}

export type ClerkTicketOutcome =
  | { kind: "redirecting" }
  | {
      kind: "requirementsDetected";
      missingFields: string[];
      resolution: ClerkRequirementResolution;
    };

/**
 * 招待 ticket の消費。sign_in ticket・既存アカウント fallback は Google SSO へ、
 * sign_up ticket は ticket 消費後に finalize か不足項目の解決方針を返す。
 * エラーは既存アカウント fallback 以外はそのまま投げる。
 */
export async function consumeClerkInvitationTicket(params: {
  signIn: ClerkSignIn | undefined;
  signUp: ClerkSignUp | undefined;
  shouldUseSignIn: boolean;
  clerkTicket: string;
  fallbackUrl: string;
}): Promise<ClerkTicketOutcome> {
  const { signIn, signUp, shouldUseSignIn, clerkTicket, fallbackUrl } = params;

  if (shouldUseSignIn) {
    await startGoogleSignInForInvitation(signIn, fallbackUrl);
    return { kind: "redirecting" };
  }

  if (!signUp) {
    throw new Error("Clerk sign-up client is not loaded");
  }

  try {
    const signUpResult: ClerkSignUpResult = await signUp.ticket({ ticket: clerkTicket });
    if (signUpResult.error) {
      throw signUpResult.error;
    }

    const finalized = await finalizeClerkSignUp(signUp, fallbackUrl);
    if (finalized) {
      return { kind: "redirecting" };
    }

    const missingFields = getMissingFields(signUpResult, signUp);
    if (hasPasswordField(missingFields)) {
      const ssoResult = await signUp.sso({
        redirectCallbackUrl: OAUTH_CALLBACK_PATH,
        redirectUrl: fallbackUrl,
        strategy: "oauth_google",
      });
      if (ssoResult.error) {
        throw ssoResult.error;
      }
      return { kind: "requirementsDetected", missingFields, resolution: "ssoRedirect" };
    }
    if (hasSupportedProfileFields(missingFields)) {
      return { kind: "requirementsDetected", missingFields, resolution: "profileForm" };
    }
    return { kind: "requirementsDetected", missingFields, resolution: "unsupported" };
  } catch (caughtError) {
    if (isExistingAccountInvitationError(caughtError)) {
      await startGoogleSignInForInvitation(signIn, fallbackUrl);
      return { kind: "redirecting" };
    }
    throw caughtError;
  }
}
