import { api } from "../../../../convex/_generated/api";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/react";
import { useAction, useConvexAuth } from "convex/react";
import {
  buildInvitationFallbackUrl,
  CLERK_STATUS_SIGN_IN,
  firstNameFieldNames,
  getMissingFields,
  hasPasswordField,
  hasSupportedProfileFields,
  isExistingAccountInvitationError,
  lastNameFieldNames,
  OAUTH_CALLBACK_PATH,
  type ClerkSignIn,
  type ClerkSignUp,
  type ClerkSignUpResult,
} from "../lib/groupInvitationClerk";

export function useGroupInvitationAccept() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const { signIn: rawSignIn } = useSignIn();
  const { signUp: rawSignUp } = useSignUp();
  const signIn = rawSignIn as unknown as ClerkSignIn | undefined;
  const signUp = rawSignUp as unknown as ClerkSignUp | undefined;
  const { isAuthenticated } = useConvexAuth();
  const acceptInvitation = useAction(api.groups.clerkInvitations.acceptInvitation);
  const [error, setError] = useState("");
  const [needsProfileDetails, setNeedsProfileDetails] = useState(false);
  const [missingProfileFields, setMissingProfileFields] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isCompletingInvitation, setIsCompletingInvitation] = useState(false);
  const hasStartedClerkInvitation = useRef(false);
  const hasAccepted = useRef(false);

  const token = searchParams.get("token");
  const clerkTicket = searchParams.get("__clerk_ticket");
  const clerkStatus = searchParams.get("__clerk_status");
  const fallbackUrl = buildInvitationFallbackUrl(token);

  const finalizeInvitation = useCallback(async () => {
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
  }, [fallbackUrl, signUp]);

  const startGoogleSignIn = useCallback(async () => {
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
  }, [fallbackUrl, signIn]);

  useEffect(() => {
    if (
      !isClerkLoaded ||
      !isSignedIn ||
      !token ||
      !clerkTicket ||
      hasStartedClerkInvitation.current
    ) {
      return;
    }

    hasStartedClerkInvitation.current = true;
    signOut({ redirectUrl: `${window.location.pathname}${window.location.search}` }).catch(
      (caughtError: unknown) => {
        hasStartedClerkInvitation.current = false;
        console.error(
          "[GroupInvitationAcceptPage] failed to sign out current session:",
          caughtError,
        );
        setError("招待リンクの認証を開始できませんでした。リンクを開き直して再度お試しください。");
      },
    );
  }, [clerkTicket, isClerkLoaded, isSignedIn, signOut, token]);

  useEffect(() => {
    if (
      !isClerkLoaded ||
      isSignedIn ||
      !token ||
      !clerkTicket ||
      hasStartedClerkInvitation.current
    ) {
      return;
    }
    const shouldUseSignIn = clerkStatus === CLERK_STATUS_SIGN_IN;
    if ((shouldUseSignIn && !signIn) || (!shouldUseSignIn && !signUp)) {
      return;
    }

    hasStartedClerkInvitation.current = true;

    const consumeClerkInvitation = async () => {
      if (shouldUseSignIn) {
        await startGoogleSignIn();
        return;
      }

      if (!signUp) {
        throw new Error("Clerk sign-up client is not loaded");
      }

      try {
        const signUpResult = await signUp.ticket({ ticket: clerkTicket });
        if (signUpResult.error) {
          throw signUpResult.error;
        }

        const finalized = await finalizeInvitation();
        if (!finalized) {
          const missingFields = getMissingFields(signUpResult, signUp);
          setMissingProfileFields(missingFields);

          if (hasPasswordField(missingFields)) {
            const ssoResult = await signUp.sso({
              redirectCallbackUrl: OAUTH_CALLBACK_PATH,
              redirectUrl: fallbackUrl,
              strategy: "oauth_google",
            });
            if (ssoResult.error) {
              throw ssoResult.error;
            }
            return;
          }

          if (hasSupportedProfileFields(missingFields)) {
            setNeedsProfileDetails(true);
            return;
          }

          console.error(
            "[GroupInvitationAcceptPage] unsupported Clerk invitation requirements:",
            missingFields,
          );
          setError(
            "招待の認証に追加の設定が必要です。Clerkのサインアップ必須項目を確認してください。",
          );
        }
      } catch (caughtError) {
        if (isExistingAccountInvitationError(caughtError)) {
          await startGoogleSignIn();
          return;
        }
        throw caughtError;
      }
    };

    Promise.resolve()
      .then(() => {
        setIsCompletingInvitation(true);
        return consumeClerkInvitation();
      })
      .catch((caughtError: unknown) => {
        hasStartedClerkInvitation.current = false;
        console.error(
          "[GroupInvitationAcceptPage] failed to consume Clerk invitation:",
          caughtError,
        );
        setError("招待リンクの認証を完了できませんでした。リンクを開き直して再度お試しください。");
      })
      .finally(() => {
        setIsCompletingInvitation(false);
      });
  }, [
    clerkStatus,
    clerkTicket,
    fallbackUrl,
    finalizeInvitation,
    isClerkLoaded,
    isSignedIn,
    signIn,
    signUp,
    startGoogleSignIn,
    token,
  ]);

  const handleProfileDetailsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp) {
      return;
    }

    setError("");
    setIsCompletingInvitation(true);
    try {
      const updateParams: { firstName?: string; lastName?: string } = {};
      if (missingProfileFields.some((field) => firstNameFieldNames.has(field))) {
        updateParams.firstName = firstName.trim();
      }
      if (missingProfileFields.some((field) => lastNameFieldNames.has(field))) {
        updateParams.lastName = lastName.trim();
      }

      const updateResult: ClerkSignUpResult = await signUp.update(updateParams);
      if (updateResult.error) {
        throw updateResult.error;
      }

      const finalized = await finalizeInvitation();
      if (!finalized) {
        setError("招待の認証に必要な情報を完了できませんでした。入力内容を確認してください。");
      }
    } catch (caughtError: unknown) {
      console.error(
        "[GroupInvitationAcceptPage] failed to complete invitation profile:",
        caughtError,
      );
      setError("招待の認証に必要な情報を保存できませんでした。入力内容を確認してください。");
    } finally {
      setIsCompletingInvitation(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated || hasAccepted.current || !token || clerkTicket) {
      return;
    }

    hasAccepted.current = true;
    acceptInvitation({ token })
      .then(() => {
        navigate("/", { replace: true });
      })
      .catch((caughtError: unknown) => {
        hasAccepted.current = false;
        console.error("[GroupInvitationAcceptPage] failed to accept invitation:", caughtError);
        setError(
          "招待を処理できませんでした。招待リンクを確認し、時間を置いて再度お試しください。",
        );
      });
  }, [acceptInvitation, clerkTicket, isAuthenticated, navigate, token]);

  return {
    error,
    firstName,
    isCompletingInvitation,
    lastName,
    missingProfileFields,
    needsProfileDetails,
    setFirstName,
    setLastName,
    handleProfileDetailsSubmit,
    token,
  };
}
