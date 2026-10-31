import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/react";
import { useAction, useConvexAuth } from "convex/react";
import {
  buildInvitationFallbackUrl,
  CLERK_STATUS_SIGN_IN,
  firstNameFieldNames,
  lastNameFieldNames,
  type ClerkSignIn,
  type ClerkSignUp,
  type ClerkSignUpResult,
} from "../lib/groupInvitationClerk";
import { consumeClerkInvitationTicket, finalizeClerkSignUp } from "../lib/groupInvitationClerkFlow";
import {
  groupInvitationAcceptReducer,
  initialGroupInvitationAcceptState,
  selectInvitation,
  selectNeedsAccountSwitch,
  selectNeedsGroupSwitch,
} from "../lib/groupInvitationAcceptState";

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
  const acceptInvitation = useAction(api.groups.clerkInvitations.acceptInvitation);
  const [state, dispatch] = useReducer(
    groupInvitationAcceptReducer,
    initialGroupInvitationAcceptState,
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const hasStartedClerkInvitation = useRef(false);
  const hasAccepted = useRef(false);

  const token = searchParams.get("token");
  const clerkTicket = searchParams.get("__clerk_ticket");
  const clerkStatus = searchParams.get("__clerk_status");
  const fallbackUrl = buildInvitationFallbackUrl(token);

  const needsAccountSwitch = selectNeedsAccountSwitch({
    isClerkLoaded,
    isSignedIn,
    token,
    clerkTicket,
  });
  const invitation = selectInvitation(state, { isAuthenticated, clerkTicket, token });
  const needsGroupSwitch = selectNeedsGroupSwitch(invitation);

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
    dispatch({ type: "accountSwitchStarted" });
    try {
      await signOut({ redirectUrl: `${window.location.pathname}${window.location.search}` });
    } catch (caughtError: unknown) {
      hasStartedClerkInvitation.current = false;
      console.error("[GroupInvitationAcceptPage] failed to sign out current session:", caughtError);
      dispatch({ type: "accountSwitchFailed" });
    } finally {
      dispatch({ type: "processingFinished" });
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

    Promise.resolve()
      .then(() => {
        dispatch({ type: "clerkTicketStarted" });
        return consumeClerkInvitationTicket({
          signIn,
          signUp,
          shouldUseSignIn,
          clerkTicket,
          fallbackUrl,
        });
      })
      .then((outcome) => {
        if (outcome.kind !== "requirementsDetected") {
          return;
        }
        if (outcome.resolution === "unsupported") {
          console.error(
            "[GroupInvitationAcceptPage] unsupported Clerk invitation requirements:",
            outcome.missingFields,
          );
        }
        dispatch({
          type: "clerkRequirementsDetected",
          missingFields: outcome.missingFields,
          resolution: outcome.resolution,
        });
      })
      .catch((caughtError: unknown) => {
        hasStartedClerkInvitation.current = false;
        console.error(
          "[GroupInvitationAcceptPage] failed to consume Clerk invitation:",
          caughtError,
        );
        dispatch({ type: "clerkTicketFailed" });
      })
      .finally(() => {
        dispatch({ type: "processingFinished" });
      });
  }, [clerkStatus, clerkTicket, fallbackUrl, isClerkLoaded, isSignedIn, signIn, signUp, token]);

  const handleProfileDetailsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!signUp) {
      return;
    }

    dispatch({ type: "profileDetailsStarted" });
    try {
      const updateParams: { firstName?: string; lastName?: string } = {};
      if (state.missingProfileFields.some((field) => firstNameFieldNames.has(field))) {
        updateParams.firstName = firstName.trim();
      }
      if (state.missingProfileFields.some((field) => lastNameFieldNames.has(field))) {
        updateParams.lastName = lastName.trim();
      }

      const updateResult: ClerkSignUpResult = await signUp.update(updateParams);
      if (updateResult.error) {
        throw updateResult.error;
      }

      const finalized = await finalizeClerkSignUp(signUp, fallbackUrl);
      if (!finalized) {
        dispatch({ type: "profileDetailsFinalizeFailed" });
      }
    } catch (caughtError: unknown) {
      console.error(
        "[GroupInvitationAcceptPage] failed to complete invitation profile:",
        caughtError,
      );
      dispatch({ type: "profileDetailsFailed" });
    } finally {
      dispatch({ type: "processingFinished" });
    }
  };

  useEffect(() => {
    let cancelled = false;
    hasAccepted.current = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      dispatch({ type: "invitationContextReset" });
      if (!isAuthenticated || !token || clerkTicket) return;
      try {
        const details = await previewInvitation({ token });
        if (!cancelled) dispatch({ type: "previewLoaded", preview: { token, details } });
      } catch {
        if (!cancelled) dispatch({ type: "previewFailed" });
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
      (needsGroupSwitch && !state.switchActiveGroup)
    ) {
      return;
    }
    hasAccepted.current = true;
    dispatch({ type: "acceptStarted" });
    try {
      await acceptInvitation({
        token,
        switchActiveGroup: needsGroupSwitch && state.switchActiveGroup,
        ...(invitation.activeGroupId
          ? { expectedActiveGroupId: invitation.activeGroupId as Id<"groups"> }
          : {}),
      });
      navigate("/", { replace: true });
    } catch {
      hasAccepted.current = false;
      dispatch({ type: "acceptFailed" });
      try {
        const details = await previewInvitation({ token });
        dispatch({ type: "previewLoaded", preview: { token, details } });
      } catch {
        dispatch({ type: "previewFailed" });
      }
    } finally {
      dispatch({ type: "processingFinished" });
    }
  };

  const setSwitchActiveGroup = useCallback((checked: boolean) => {
    dispatch({ type: "switchConsentChanged", checked });
  }, []);

  return {
    error: state.error,
    invitation,
    needsGroupSwitch,
    switchActiveGroup: state.switchActiveGroup,
    setSwitchActiveGroup,
    handleAcceptInvitation,
    firstName,
    isCompletingInvitation: state.isCompletingInvitation,
    lastName,
    missingProfileFields: state.missingProfileFields,
    needsProfileDetails: state.needsProfileDetails,
    needsAccountSwitch,
    setFirstName,
    setLastName,
    handleProfileDetailsSubmit,
    handleAccountSwitch,
    token,
  };
}
