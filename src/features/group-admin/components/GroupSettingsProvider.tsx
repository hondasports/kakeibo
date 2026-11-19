import { api } from "../../../../convex/_generated/api";
import { createContext, type ReactNode, useContext } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

function useGroupSettingsValue() {
  const group = useQuery(api.groups.queries.getMyGroup);
  const groups = useQuery(api.groups.queries.listMyGroups);
  const members = useQuery(api.groups.queries.getGroupMembers, { allowUnavailable: true });
  const pendingInvitations = useQuery(
    api.groups.queries.listPendingGroupInvitations,
    group?.role === "owner" ? { allowUnavailable: true } : "skip",
  );
  const managementAuditLogs = useQuery(
    api.groups.auditLogs.listManagementAuditLogs,
    group?.role === "owner" ? { allowUnavailable: true } : "skip",
  );

  return {
    group,
    groups,
    members,
    pendingInvitations,
    managementAuditLogs,
    setActiveGroup: useMutation(api.groups.mutations.setActiveGroup),
    removeMember: useMutation(api.groups.members.removeMember),
    changeMemberRole: useMutation(api.groups.members.changeMemberRole),
    transferGroupOwnership: useMutation(api.groups.members.transferGroupOwnership),
    requestGroupDeletion: useMutation(api.groups.deletion.requestGroupDeletion),
    updateGroupName: useMutation(api.groups.mutations.updateGroupName),
    inviteMember: useAction(api.groups.clerkInvitations.inviteMember),
    cancelPendingGroupInvitation: useAction(
      api.groups.clerkInvitations.cancelPendingGroupInvitation,
    ),
  };
}

type GroupSettingsContextValue = ReturnType<typeof useGroupSettingsValue>;
const GroupSettingsContext = createContext<GroupSettingsContextValue | null>(null);

export function GroupSettingsProvider({ children }: { children: ReactNode }) {
  const value = useGroupSettingsValue();
  return <GroupSettingsContext.Provider value={value}>{children}</GroupSettingsContext.Provider>;
}

export function useGroupSettings() {
  const value = useContext(GroupSettingsContext);
  if (!value) throw new Error("useGroupSettings must be used within GroupSettingsProvider");
  return value;
}

export function useHasGroupSettingsProvider() {
  return useContext(GroupSettingsContext) !== null;
}
