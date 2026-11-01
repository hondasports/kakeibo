import type { Id } from "../../_generated/dataModel";
import type { GroupRole } from "../../../lib/domain/groups/role";

export type GroupMembership = {
  membershipId: Id<"groupMembers">;
  groupId: Id<"groups">;
  userId: string;
  role: GroupRole;
};

export type GroupDoc = {
  _id: Id<"groups">;
  name: string;
  clerkOrganizationId?: string;
  status?: "active" | "deleting" | "deleted" | "archived";
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type UserDoc = {
  _id: Id<"users">;
  activeGroupId?: Id<"groups">;
};

export type GroupMemberListItem = {
  userId: string;
  role: GroupRole;
  displayName: string;
  email: string | null;
  isActiveGroup: boolean;
  createdAt: number;
};

export type GroupPendingInvitationListItem = {
  _id: Id<"groupInvitations">;
  email: string;
  status: "pending";
  createdAt: number;
};
