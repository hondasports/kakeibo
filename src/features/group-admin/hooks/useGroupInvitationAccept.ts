import type { Id } from "../../../../convex/_generated/dataModel";
import type { GroupInvitationPreview } from "../../../../lib/domain/groups/groupInvitation";
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
  const previewInvitation = useAction(api.groups.clerkInvitations.previewInvitation);
  const [previewResult, setPreviewResult] = useState<{
    token: string;
    details: GroupInvitationPreview;
  } | null>(null);
  const [switchActiveGroup, setSwitchActiveGroup] = useState(false);
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

  const needsAccountSwitch = Boolean(isClerkLoaded && isSignedIn && token && clerkTicket);

  const handleAccountSwitch = async () => {
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
    setError("");
    setIsCompletingInvitation(true);
    try {
      await signOut({ redirectUrl: `${window.location.pathname}${window.location.search}` });
    } catch (caughtError: unknown) {
      hasStartedClerkInvitation.current = false;
      console.error("[GroupInvitationAcceptPage] failed to sign out current session:", caughtError);
      setError("招待リンクの認証を開始できませんでした。リンクを開き直して再度お試しください。");
    } finally {
      setIsCompletingInvitation(false);
    }
  };

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

  const invitation =
    isAuthenticated && !clerkTicket && previewResult?.token === token
      ? previewResult.details
      : null;
  const needsGroupSwitch = Boolean(
    invitation?.activeGroupId && invitation.activeGroupId !== invitation.groupId,
  );

  useEffect(() => {
    let cancelled = false;
    hasAccepted.current = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setPreviewResult(null);
      setSwitchActiveGroup(false);
      setError("");
      if (!isAuthenticated || !token || clerkTicket) return;
      try {
        const details = await previewInvitation({ token });
        if (!cancelled) setPreviewResult({ token, details });
      } catch {
        if (!cancelled)
          setError(
            "招待内容を確認できませんでした。招待先のアカウントとリンクの有効性を確認してください。",
          );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clerkTicket, isAuthenticated, previewInvitation, token]);

  const handleAcceptInvitation = async () => {
    if (
      !isAuthenticated ||
      !invitation ||
      !token ||
      clerkTicket ||
      hasAccepted.current ||
      (needsGroupSwitch && !switchActiveGroup)
    ) {
      return;
    }
    hasAccepted.current = true;
    setIsCompletingInvitation(true);
    setError("");
    try {
      await acceptInvitation({
        token,
        switchActiveGroup: needsGroupSwitch && switchActiveGroup,
        ...(invitation.activeGroupId
          ? { expectedActiveGroupId: invitation.activeGroupId as Id<"groups"> }
          : {}),
      });
      navigate("/", { replace: true });
    } catch {
      hasAccepted.current = false;
      setSwitchActiveGroup(false);
      setPreviewResult(null);
      setError("招待を処理できませんでした。招待内容を再確認して、もう一度操作してください。");
      try {
        const details = await previewInvitation({ token });
        setPreviewResult({ token, details });
      } catch {
        setError(
          "招待内容を確認できませんでした。招待先のアカウントとリンクの有効性を確認してください。",
        );
      }
    } finally {
      setIsCompletingInvitation(false);
    }
  };

  return {
    error,
    invitation,
    needsGroupSwitch,
    switchActiveGroup,
    setSwitchActiveGroup,
    handleAcceptInvitation,
    firstName,
    isCompletingInvitation,
    lastName,
    missingProfileFields,
    needsProfileDetails,
    needsAccountSwitch,
    setFirstName,
    setLastName,
    handleProfileDetailsSubmit,
    handleAccountSwitch,
    token,
  };
}
