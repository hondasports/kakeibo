import { Alert, Button, List, ListItem, Paper, Stack, TextField, Typography } from "@mui/material";
import type { MembershipOperation } from "../../../../lib/domain/systemAdmin/membershipOperation";
import type { MembershipDialogGroup } from "./SystemAdminMembershipChangeDialog";
import type { GroupCandidate, UserDetail } from "../hooks/useSystemAdminUserDetail";

type UserMembershipsSectionProps = {
  detail: UserDetail;
  groupQuery: string;
  candidates: GroupCandidate[];
  selectedSource?: MembershipDialogGroup;
  onGroupQueryChange: (query: string) => void;
  onSelectSource: (source: MembershipDialogGroup) => void;
  onRequestOperation: (
    operation: MembershipOperation,
    sourceGroup?: MembershipDialogGroup,
    targetGroup?: MembershipDialogGroup,
  ) => void;
};

export function UserMembershipsSection({
  detail,
  groupQuery,
  candidates,
  selectedSource,
  onGroupQueryChange,
  onSelectSource,
  onRequestOperation,
}: UserMembershipsSectionProps) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h3" variant="h6">
        所属グループ
      </Typography>
      <Stack spacing={1} sx={{ mt: 1 }}>
        {detail.memberships.length ? (
          <List disablePadding>
            {detail.memberships.map((membership) => {
              const source = { id: membership.groupId, name: membership.groupName };
              return (
                <ListItem
                  data-testid={`system-admin-membership-${membership.groupId}`}
                  key={membership.groupId}
                  sx={{ display: "block", px: 0 }}
                >
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
                      {membership.groupName}（{membership.groupId}） / {membership.role}
                    </Typography>
                    <Button
                      disabled={membership.role === "owner"}
                      onClick={() => onRequestOperation("remove", source)}
                      size="small"
                      title={
                        membership.role === "owner" ? "ownerの解除は#477で行います" : undefined
                      }
                      variant="outlined"
                    >
                      グループから外す
                    </Button>
                    <Button
                      onClick={() => onRequestOperation("set_active", undefined, source)}
                      size="small"
                      variant="outlined"
                    >
                      activeに設定
                    </Button>
                    <Button
                      disabled={membership.role === "owner"}
                      onClick={() => onSelectSource(source)}
                      size="small"
                      title={
                        membership.role === "owner" ? "ownerの付替えは#477で行います" : undefined
                      }
                      variant={selectedSource?.id === source.id ? "contained" : "text"}
                    >
                      移動元に選択
                    </Button>
                  </Stack>
                  {membership.role === "owner" ? (
                    <Typography color="text.secondary" variant="caption">
                      ownerの解除・付替えは#477で行います。
                    </Typography>
                  ) : null}
                </ListItem>
              );
            })}
          </List>
        ) : (
          <Typography color="text.secondary">所属グループはありません。</Typography>
        )}
        {detail.membershipsTruncated ? (
          <Alert severity="warning">所属グループは上限件数まで表示しています。</Alert>
        ) : null}
        <TextField
          label="追加・移動先グループを検索"
          onChange={(event) => onGroupQueryChange(event.target.value)}
          value={groupQuery}
        />
        {candidates.map((candidate) => {
          const target = { id: candidate.id, name: candidate.name, status: candidate.status };
          return (
            <Stack
              key={candidate.id}
              sx={{ alignItems: "center", display: "flex", flexDirection: "row", gap: 1 }}
            >
              <Typography sx={{ flex: 1 }}>
                {candidate.name}（{candidate.id}）
              </Typography>
              <Button
                onClick={() =>
                  onRequestOperation(selectedSource ? "transfer" : "add", selectedSource, target)
                }
                size="small"
                variant="contained"
              >
                {selectedSource ? "このグループへ移動" : "このグループに追加"}
              </Button>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}
