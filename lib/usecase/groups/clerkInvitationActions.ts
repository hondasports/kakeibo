import type { buildClerkInvitationParams } from "../../domain/groups/clerkInvitations";
import {
  buildGroupInvitationRecordInput,
  requireInvitationGroup,
  resolveInvitationEmail,
  type InvitationGroupRecord,
} from "../../domain/groups/invitationFlow";

export type ClerkInvitationStore = {
  getMyGroup: () => Promise<InvitationGroupRecord | null>;
  getAuthenticatedUserId: () => Promise<string>;
  createGroupInvitationRecord: (
    input: ReturnType<typeof buildGroupInvitationRecordInput>,
  ) => Promise<unknown>;
  deletePendingGroupInvitationRecordByToken: (token: string) => Promise<unknown>;
  cancelPendingGroupInvitation: (invitationId: string) => Promise<{ clerkInvitationIds: string[] }>;
};

export type InviteClerkServices = {
  createToken: () => string;
  buildRedirectUrl: (rawRedirectUrl: string, token: string) => string;
  buildClerkInvitationParams: (
    email: string,
    redirectUrl: string,
    groupId: string,
    token: string,
  ) => ReturnType<typeof buildClerkInvitationParams>;
  getClerk: () => {
    invitations: {
      createInvitation: (
        params: ReturnType<typeof buildClerkInvitationParams>,
      ) => Promise<{ id: string }>;
    };
  };
  warn: (message: string, errorName: string) => void;
};

export type CancelClerkServices = {
  getClerk: () => {
    invitations: {
      revokeInvitation: (invitationId: string) => Promise<unknown>;
    };
  };
  warn: (message: string, errorName: string) => void;
};

export type InviteMemberResult = {
  token: string;
  clerkInvitationId: string;
  clerkOrganizationId: string | null;
};

export async function inviteMember(
  store: ClerkInvitationStore,
  services: InviteClerkServices,
  args: { email: string; redirectUrl: string },
): Promise<InviteMemberResult> {
  const group = requireInvitationGroup(await store.getMyGroup());
  const currentUserId = await store.getAuthenticatedUserId();

  const email = resolveInvitationEmail(args.email);
  const token = services.createToken();
  const redirectUrl = services.buildRedirectUrl(args.redirectUrl, token);

  const baseRecord = {
    groupId: group._id,
    email,
    token,
    invitedByUserId: currentUserId,
  };
  await store.createGroupInvitationRecord(buildGroupInvitationRecordInput(baseRecord));

  const clerk = services.getClerk();
  let invitation: { id: string };
  try {
    invitation = await clerk.invitations.createInvitation(
      services.buildClerkInvitationParams(email, redirectUrl, group._id, token),
    );
  } catch (caughtError) {
    try {
      await store.deletePendingGroupInvitationRecordByToken(token);
    } catch (cleanupError) {
      services.warn(
        "[groups.clerkInvitations.inviteMember] failed to clean up reserved invitation",
        cleanupError instanceof Error ? cleanupError.name : "UnknownError",
      );
    }
    throw caughtError;
  }

  await store.createGroupInvitationRecord(
    buildGroupInvitationRecordInput({
      ...baseRecord,
      clerkInvitationId: invitation.id,
    }),
  );

  return {
    token,
    clerkInvitationId: invitation.id,
    clerkOrganizationId: group.clerkOrganizationId,
  };
}

export async function cancelPendingGroupInvitation(
  store: ClerkInvitationStore,
  services: CancelClerkServices,
  args: { invitationId: string },
): Promise<null> {
  requireInvitationGroup(await store.getMyGroup());

  const { clerkInvitationIds } = await store.cancelPendingGroupInvitation(args.invitationId);

  const clerk = services.getClerk();
  for (const clerkInvitationId of clerkInvitationIds) {
    try {
      await clerk.invitations.revokeInvitation(clerkInvitationId);
    } catch (caughtError) {
      services.warn(
        "[groups.clerkInvitations.cancelPendingGroupInvitation] failed to revoke Clerk invitation",
        caughtError instanceof Error ? caughtError.name : "UnknownError",
      );
    }
  }

  return null;
}
