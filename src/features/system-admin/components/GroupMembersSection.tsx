import { Alert, Button, List, ListItem, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { GroupDetail, GroupDetailMember } from "../hooks/useSystemAdminGroupDetail";
import type { GroupRole } from "../../../../lib/domain/groups/role";
import { displayLabel, groupRoleLabels } from "../lib/displayLabels";
import { DETAIL_LIST_LIMIT } from "../../../../lib/domain/systemAdmin/searchQuery";

type GroupMembersSectionProps = {
  detail: GroupDetail;
  stale: boolean;
  ownerless: boolean;
  ownerCount: number;
  roleTarget: GroupDetailMember | null;
  roleOperation: "role_change" | "owner_transfer" | null;
  roleSource: GroupDetailMember | null;
  onRequestRemove: (member: GroupDetailMember) => void;
  onRequestRoleChange: (
    member: GroupDetailMember,
    operation: "role_change" | "owner_transfer",
    newRole?: GroupRole,
  ) => void;
  onSelectRoleSource: (member: GroupDetailMember) => void;
  onCancelRoleOperation: () => void;
};

export function GroupMembersSection({
  detail,
  stale,
  ownerless,
  ownerCount,
  roleTarget,
  roleOperation,
  roleSource,
  onRequestRemove,
  onRequestRoleChange,
  onSelectRoleSource,
  onCancelRoleOperation,
}: GroupMembersSectionProps) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h3" variant="h6">
        所属メンバー
      </Typography>
      {detail.members.length ? (
        <List>
          {detail.members.map((member) => (
            <ListItem key={member.userId} sx={{ display: "block" }}>
              <Stack
                sx={{
                  alignItems: "flex-start",
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Typography sx={{ flex: 1, minWidth: 220 }}>
                  {member.displayName ?? "ユーザー"}（{member.email ?? "email未登録"}） /{" "}
                  {displayLabel(groupRoleLabels, member.role)}
                </Typography>
                {member.userDocumentId ? (
                  <Button
                    component={Link}
                    size="small"
                    to={`/admin/users/${member.userDocumentId}`}
                    variant="text"
                  >
                    ユーザー詳細
                  </Button>
                ) : null}
                <Button
                  disabled={stale || member.role === "owner" || !member.userDocumentId}
                  onClick={() => onRequestRemove(member)}
                  size="small"
                  title={
                    member.role === "owner"
                      ? "ownerはmemberへ変更してから解除できます（ownerが0人になる操作はできません）"
                      : undefined
                  }
                  variant="outlined"
                >
                  グループから外す
                </Button>
                {member.role === "member" && member.userDocumentId && !ownerless ? (
                  <Button
                    disabled={stale}
                    onClick={() => onRequestRoleChange(member, "role_change", "owner")}
                    size="small"
                    variant="outlined"
                  >
                    ownerへ昇格
                  </Button>
                ) : null}
                {member.role === "owner" && ownerCount > 1 && member.userDocumentId ? (
                  <Button
                    disabled={stale}
                    onClick={() => onRequestRoleChange(member, "role_change", "member")}
                    size="small"
                    variant="outlined"
                  >
                    memberへ変更
                  </Button>
                ) : null}
                {member.role === "member" && member.userDocumentId && !ownerless ? (
                  <Button
                    disabled={stale}
                    onClick={() => onRequestRoleChange(member, "owner_transfer")}
                    size="small"
                    variant="outlined"
                  >
                    owner付替え先にする
                  </Button>
                ) : null}
                {member.role === "owner" &&
                roleTarget !== null &&
                roleOperation === "owner_transfer" &&
                member.userDocumentId ? (
                  <Button
                    disabled={stale}
                    onClick={() => onSelectRoleSource(member)}
                    size="small"
                    variant="outlined"
                  >
                    このownerを付替え元に選択
                  </Button>
                ) : null}
              </Stack>
              {member.role === "owner" ? (
                <Typography color="text.secondary" variant="caption">
                  ownerの解除・付替えは、ownerが0人にならない条件でのみこの画面から行えます。
                </Typography>
              ) : null}
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          所属メンバーはいません。
        </Typography>
      )}
      {detail.membersTruncated ? (
        <Alert severity="warning">
          メンバーは上限{DETAIL_LIST_LIMIT}件まで表示しています（{detail.members.length}件を表示）。
        </Alert>
      ) : null}
      {roleOperation === "owner_transfer" && roleTarget && !roleSource ? (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" disabled={stale} onClick={onCancelRoleOperation} size="small">
              取消
            </Button>
          }
        >
          owner付替え先に「{roleTarget.displayName ?? "ユーザー"}
          」を選択しました。付替え元にするownerを選択してください。
        </Alert>
      ) : null}
    </Paper>
  );
}
