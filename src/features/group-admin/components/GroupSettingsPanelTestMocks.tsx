import { beforeEach, vi } from "vitest";

const {
  cancelPendingGroupInvitationMock,
  changeMemberRoleMock,
  deleteGroupMock,
  inviteMemberMock,
  navigateMock,
  removeMemberMock,
  setActiveGroupMock,
  transferGroupOwnershipMock,
  updateGroupNameMock,
  useActionMock,
  useAuthMock,
  useMutationMock,
  useQueryMock,
  useUserMock,
} = vi.hoisted(() => ({
  cancelPendingGroupInvitationMock: vi.fn(),
  changeMemberRoleMock: vi.fn(),
  deleteGroupMock: vi.fn(),
  inviteMemberMock: vi.fn(),
  navigateMock: vi.fn(),
  removeMemberMock: vi.fn(),
  setActiveGroupMock: vi.fn(),
  transferGroupOwnershipMock: vi.fn(),
  updateGroupNameMock: vi.fn(),
  useActionMock: vi.fn(),
  useAuthMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
  useUserMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@clerk/react", () => ({
  useAuth: useAuthMock,
  useUser: useUserMock,
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    groups: {
      clerkInvitations: {
        cancelPendingGroupInvitation: "groups.clerkInvitations.cancelPendingGroupInvitation",
        inviteMember: "groups.clerkInvitations.inviteMember",
      },
      queries: {
        getGroupMembers: "groups.queries.getGroupMembers",
        getMyGroup: "groups.queries.getMyGroup",
        listMyGroups: "groups.queries.listMyGroups",
        listPendingGroupInvitations: "groups.queries.listPendingGroupInvitations",
      },
      members: {
        removeMember: "groups.members.removeMember",
        changeMemberRole: "groups.members.changeMemberRole",
        transferGroupOwnership: "groups.members.transferGroupOwnership",
      },
      mutations: {
        setActiveGroup: "groups.mutations.setActiveGroup",
        updateGroupName: "groups.mutations.updateGroupName",
      },
      deletion: {
        requestGroupDeletion: "groups.deletion.requestGroupDeletion",
        getGroupDeletionPreview: "groups.deletion.getGroupDeletionPreview",
      },
      auditLogs: {
        listManagementAuditLogs: "groups.auditLogs.listManagementAuditLogs",
      },
    },
  },
}));

vi.mock("convex/react", () => ({
  useAction: useActionMock,
  useMutation: useMutationMock,
  useQuery: useQueryMock,
}));

beforeEach(() => {
  cancelPendingGroupInvitationMock.mockReset();
  changeMemberRoleMock.mockReset();
  deleteGroupMock.mockReset();
  inviteMemberMock.mockReset();
  navigateMock.mockReset();
  removeMemberMock.mockReset();
  setActiveGroupMock.mockReset();
  transferGroupOwnershipMock.mockReset();
  updateGroupNameMock.mockReset();
  useActionMock.mockReset();
  useAuthMock.mockReset();
  useMutationMock.mockReset();
  useQueryMock.mockReset();
  useUserMock.mockReset();

  cancelPendingGroupInvitationMock.mockResolvedValue(null);
  inviteMemberMock.mockResolvedValue({
    token: "invite-token",
    clerkInvitationId: "clerk-invite-001",
    clerkOrganizationId: "org-001",
  });
  setActiveGroupMock.mockResolvedValue("group-002");
  removeMemberMock.mockResolvedValue(undefined);
  changeMemberRoleMock.mockResolvedValue(undefined);
  transferGroupOwnershipMock.mockResolvedValue(undefined);
  deleteGroupMock.mockResolvedValue("job-001");
  updateGroupNameMock.mockResolvedValue("group-001");
  useAuthMock.mockReturnValue({ userId: "owner-clerk-id" });
  useUserMock.mockReturnValue({
    user: {
      fullName: "ログイン 太郎",
      username: "login-taro",
      firstName: "ログイン",
      lastName: "太郎",
      primaryEmailAddress: { emailAddress: "owner@example.com" },
    },
  });
  useActionMock.mockImplementation((reference: string) => {
    if (reference.includes("groups.clerkInvitations.inviteMember")) return inviteMemberMock;
    if (reference.includes("groups.clerkInvitations.cancelPendingGroupInvitation")) {
      return cancelPendingGroupInvitationMock;
    }
    return vi.fn();
  });
  useMutationMock.mockImplementation((reference: string) => {
    if (reference.includes("groups.mutations.setActiveGroup")) return setActiveGroupMock;
    if (reference.includes("groups.members.removeMember")) return removeMemberMock;
    if (reference.includes("groups.members.changeMemberRole")) return changeMemberRoleMock;
    if (reference.includes("groups.members.transferGroupOwnership"))
      return transferGroupOwnershipMock;
    if (reference.includes("groups.mutations.updateGroupName")) return updateGroupNameMock;
    if (reference.includes("groups.deletion.requestGroupDeletion")) return deleteGroupMock;
    return vi.fn();
  });
  useQueryMock.mockImplementation((reference: string, args?: unknown) => {
    if (args === "skip") {
      return undefined;
    }
    if (
      typeof reference === "string" &&
      reference.includes("groups.deletion.getGroupDeletionPreview")
    ) {
      return {
        groupName: "佐藤家",
        members: { count: 2, accuracy: "exact" },
        invitations: { count: 1, accuracy: "exact" },
        sourceDocuments: { count: 100, accuracy: "at_least" },
        expenseEntries: { count: 3, accuracy: "exact" },
        receipts: { count: 4, accuracy: "exact" },
        receiptImages: { count: 0, accuracy: "unknown" },
        categories: { count: 6, accuracy: "exact" },
        aiDrafts: { count: 1, accuracy: "exact" },
        aiDraftItems: { count: 2, accuracy: "exact" },
        analysisBatches: { count: 1, accuracy: "exact" },
        analysisJobs: { count: 3, accuracy: "exact" },
        weekSessions: { count: 4, accuracy: "exact" },
        managementAuditLogs: { count: 5, accuracy: "exact" },
      };
    }
    if (typeof reference === "string" && reference.includes("groups.queries.getMyGroup")) {
      return {
        _id: "group-001",
        name: "佐藤家",
        role: "owner",
        createdAt: 1000,
      };
    }
    if (typeof reference === "string" && reference.includes("groups.queries.listMyGroups")) {
      return [
        { _id: "group-001", name: "佐藤家", role: "owner", isActive: true },
        { _id: "group-002", name: "鈴木家", role: "member", isActive: false },
      ];
    }
    if (typeof reference === "string" && reference.includes("groups.queries.getGroupMembers")) {
      return [
        {
          userId: "https://issuer.example|owner-clerk-id",
          role: "owner",
          displayName: "オーナー",
          email: "owner@example.com",
          createdAt: 1000,
        },
        {
          userId: "user-member",
          role: "member",
          displayName: "メンバー",
          email: "member@example.com",
          createdAt: 1000,
        },
      ];
    }
    if (
      typeof reference === "string" &&
      reference.includes("groups.queries.listPendingGroupInvitations")
    ) {
      return [
        {
          _id: "invite-001",
          email: "pending@example.com",
          status: "pending",
          createdAt: Date.UTC(2026, 0, 15, 3, 30),
        },
      ];
    }
    if (
      typeof reference === "string" &&
      reference.includes("groups.auditLogs.listManagementAuditLogs")
    ) {
      return [
        {
          _id: "log-001",
          action: "group_name_changed",
          actionLabel: "グループ名を変更",
          actorDisplayName: "オーナー",
          targetLabel: "佐藤家",
          beforeValue: "佐藤家",
          afterValue: "鈴木家",
          createdAt: Date.UTC(2026, 0, 10, 12, 0),
        },
      ];
    }
    return [];
  });
});

export {
  cancelPendingGroupInvitationMock,
  changeMemberRoleMock,
  deleteGroupMock,
  inviteMemberMock,
  navigateMock,
  removeMemberMock,
  setActiveGroupMock,
  transferGroupOwnershipMock,
  updateGroupNameMock,
  useActionMock,
  useAuthMock,
  useMutationMock,
  useQueryMock,
  useUserMock,
};
