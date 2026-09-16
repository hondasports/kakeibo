import { describe, expect, it, vi } from "vitest";
import { ClerkInvitationDomainError } from "../../domain/groups/invitationFlow";
import {
  cancelPendingGroupInvitation,
  inviteMember,
  type ClerkInvitationStore,
  type InviteClerkServices,
} from "./clerkInvitationActions";

const ownerGroup = {
  _id: "group-001",
  name: "佐藤家",
  clerkOrganizationId: null,
  role: "owner" as const,
  createdAt: 1000,
};

function createStore(overrides: Partial<ClerkInvitationStore> = {}) {
  return {
    getMyGroup: vi.fn(async () => ownerGroup),
    getAuthenticatedUserId: vi.fn(async () => "user-001"),
    createGroupInvitationRecord: vi.fn(async () => "invite-001"),
    deletePendingGroupInvitationRecordByToken: vi.fn(async () => null),
    cancelPendingGroupInvitation: vi.fn(async () => ({ clerkInvitationIds: [] })),
    ...overrides,
  } satisfies ClerkInvitationStore;
}

function createServices(overrides: Partial<InviteClerkServices> = {}) {
  return {
    createToken: vi.fn(() => "invite-token"),
    buildRedirectUrl: vi.fn((raw: string, token: string) => `${raw}?token=${token}`),
    buildClerkInvitationParams: vi.fn((email, redirectUrl, groupId, token) => ({
      emailAddress: email,
      redirectUrl,
      ignoreExisting: true as const,
      publicMetadata: { groupId, token },
    })),
    getClerk: vi.fn(() => ({
      invitations: {
        createInvitation: vi.fn(async () => ({ id: "clerk-invite-001" })),
      },
    })),
    warn: vi.fn(),
    ...overrides,
  } satisfies InviteClerkServices;
}

const args = {
  email: " Member@Example.com ",
  redirectUrl: "http://localhost:5173/group/invitations/accept",
};

describe("inviteMember", () => {
  it("予約→Clerk招待→clerkInvitationId追記の順で実行し結果を返す", async () => {
    const store = createStore();
    const services = createServices();
    const result = await inviteMember(store, services, args);
    expect(result).toEqual({
      token: "invite-token",
      clerkInvitationId: "clerk-invite-001",
      clerkOrganizationId: null,
    });
    expect(store.createGroupInvitationRecord).toHaveBeenCalledTimes(2);
    expect(store.createGroupInvitationRecord.mock.calls[0]?.[0]).toEqual({
      groupId: "group-001",
      email: "member@example.com",
      token: "invite-token",
      invitedByUserId: "user-001",
    });
    expect(store.createGroupInvitationRecord.mock.calls[1]?.[0]).toEqual({
      groupId: "group-001",
      email: "member@example.com",
      token: "invite-token",
      invitedByUserId: "user-001",
      clerkInvitationId: "clerk-invite-001",
    });
  });

  it("グループ未選択ならドメインエラーで止まり副作用を起こさない", async () => {
    const store = createStore({ getMyGroup: vi.fn(async () => null) });
    const services = createServices();
    await expect(inviteMember(store, services, args)).rejects.toBeInstanceOf(
      ClerkInvitationDomainError,
    );
    expect(services.createToken).not.toHaveBeenCalled();
    expect(services.getClerk).not.toHaveBeenCalled();
  });

  it("Clerk招待が失敗したら予約を補償削除して元エラーを再送出する", async () => {
    const clerkError = new Error("Clerk unavailable");
    const services = createServices({
      getClerk: vi.fn(() => ({
        invitations: { createInvitation: vi.fn(async () => Promise.reject(clerkError)) },
      })),
    });
    const store = createStore();
    await expect(inviteMember(store, services, args)).rejects.toBe(clerkError);
    expect(store.deletePendingGroupInvitationRecordByToken).toHaveBeenCalledWith("invite-token");
    expect(store.createGroupInvitationRecord).toHaveBeenCalledTimes(1);
  });

  it("補償削除も失敗したら warn して元のClerkエラーを再送出する", async () => {
    const clerkError = new Error("Clerk unavailable");
    const services = createServices({
      getClerk: vi.fn(() => ({
        invitations: { createInvitation: vi.fn(async () => Promise.reject(clerkError)) },
      })),
    });
    const store = createStore({
      deletePendingGroupInvitationRecordByToken: vi.fn(async () => {
        throw new Error("cleanup failed");
      }),
    });
    await expect(inviteMember(store, services, args)).rejects.toBe(clerkError);
    expect(services.warn).toHaveBeenCalledWith(
      "[groups.clerkInvitations.inviteMember] failed to clean up reserved invitation",
      "Error",
    );
  });
});

describe("cancelPendingGroupInvitation", () => {
  it("取消後に各Clerk招待をrevokeしnullを返す", async () => {
    const revokeInvitation = vi.fn(async () => undefined);
    const store = createStore({
      cancelPendingGroupInvitation: vi.fn(async () => ({
        clerkInvitationIds: ["clerk-old", "clerk-new"],
      })),
    });
    const services = {
      getClerk: vi.fn(() => ({ invitations: { revokeInvitation } })),
      warn: vi.fn(),
    };
    const result = await cancelPendingGroupInvitation(store, services, {
      invitationId: "invite-new",
    });
    expect(result).toBeNull();
    expect(revokeInvitation.mock.calls.map((c) => c[0])).toEqual(["clerk-old", "clerk-new"]);
  });

  it("revokeの個別失敗は warn して継続する", async () => {
    const revokeInvitation = vi
      .fn()
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(undefined);
    const store = createStore({
      cancelPendingGroupInvitation: vi.fn(async () => ({
        clerkInvitationIds: ["clerk-old", "clerk-new"],
      })),
    });
    const services = {
      getClerk: vi.fn(() => ({ invitations: { revokeInvitation } })),
      warn: vi.fn(),
    };
    await expect(
      cancelPendingGroupInvitation(store, services, { invitationId: "invite-new" }),
    ).resolves.toBeNull();
    expect(services.warn).toHaveBeenCalledWith(
      "[groups.clerkInvitations.cancelPendingGroupInvitation] failed to revoke Clerk invitation",
      "Error",
    );
    expect(revokeInvitation).toHaveBeenCalledTimes(2);
  });
});
