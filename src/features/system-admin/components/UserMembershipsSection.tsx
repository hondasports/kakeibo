import { Alert, Button, List, ListItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import type { MembershipOperation } from "../../../../lib/domain/systemAdmin/membershipOperation";
import type { MembershipDialogGroup } from "./SystemAdminMembershipChangeDialog";
import type { GroupCandidate, UserDetail } from "../hooks/useSystemAdminUserDetail";
import { displayLabel, groupRoleLabels, groupStatusLabels } from "../lib/displayLabels";
import { formatDateTimeForDisplay } from "../../../utils/date";

type UserMembershipsSectionProps = {
  detail: UserDetail;
  groupQuery: string;
  candidates: GroupCandidate[];
  candidatesTruncated: boolean;
  candidateSearch: "idle" | "loading" | "done" | "error";
  selectedSource?: MembershipDialogGroup;
  onGroupQueryChange: (query: string) => void;
  onSelectSource: (source: MembershipDialogGroup) => void;
  onRequestOperation: (
    operation: MembershipOperation,
    sourceGroup?: MembershipDialogGroup,
    targetGroup?: MembershipDialogGroup,
  ) => void;
  onRetryCandidateSearch: () => void;
};

export function UserMembershipsSection({
  detail,
  groupQuery,
  candidates,
  candidatesTruncated,
  candidateSearch,
  selectedSource,
  onGroupQueryChange,
  onSelectSource,
  onRequestOperation,
  onRetryCandidateSearch,
}: UserMembershipsSectionProps) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h3" variant="h6">
        所属グループ
      </Typography>
      {selectedSource ? (
        <Alert
          severity="info"
          sx={{ mt: 1 }}
          action={
            <Button color="inherit" onClick={() => onSelectSource(selectedSource)} size="small">
              解除
            </Button>
          }
        >
          移動元: {selectedSource.name}
        </Alert>
      ) : null}
      <Stack spacing={1} sx={{ mt: 1 }}>
        {detail.memberships.length ? (
          <List disablePadding>
            {detail.memberships.map((membership) => {
              const source = { id: membership.groupId, name: membership.groupName };
              const isOwner = membership.role === "owner";
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
                      {membership.groupName}（{membership.groupId}） /{" "}
                      {displayLabel(groupRoleLabels, membership.role)}
                    </Typography>
                    <Button
                      component={Link}
                      size="small"
                      to={`/admin/groups/${membership.groupId}`}
                      variant="text"
                    >
                      グループ詳細
                    </Button>
                    <Button
                      disabled={isOwner}
                      onClick={() => onRequestOperation("remove", source)}
                      size="small"
                      title={
                        isOwner
                          ? "ownerの解除はグループ詳細からmemberへ変更してから行えます"
                          : undefined
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
                      disabled={isOwner}
                      onClick={() => onSelectSource(source)}
                      size="small"
                      title={isOwner ? "ownerの付替えはグループ詳細から行えます" : undefined}
                      variant={selectedSource?.id === source.id ? "contained" : "text"}
                    >
                      移動元に選択
                    </Button>
                  </Stack>
                  {isOwner ? (
                    <Typography color="text.secondary" variant="caption">
                      ownerの権限変更・付替えはグループ詳細から行えます。
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
          <Alert severity="warning">
            所属グループは上限20件まで表示しています（{detail.memberships.length}件を表示）。
            対象が見つからないときはユーザーの条件を絞ってください。
          </Alert>
        ) : null}
        <TextField
          label="追加・移動先グループを検索"
          onChange={(event) => onGroupQueryChange(event.target.value)}
          value={groupQuery}
        />
        {candidateSearch === "loading" ? (
          <Typography color="text.secondary" variant="body2">
            グループ候補を検索しています…
          </Typography>
        ) : null}
        {candidateSearch === "error" ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={onRetryCandidateSearch} size="small">
                再試行
              </Button>
            }
            variant="outlined"
          >
            グループ候補を取得できませんでした。
          </Alert>
        ) : null}
        {candidateSearch === "done" && candidates.length === 0 ? (
          <Typography color="text.secondary" variant="body2">
            {candidatesTruncated
              ? "先頭20件に追加先・移動先の候補はありません。検索条件を絞ってください。"
              : "この条件で見つかる追加先・移動先の候補はありません。検索条件を変えてみてください。"}
          </Typography>
        ) : null}
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
              <Typography color="text.secondary" variant="caption">
                {displayLabel(groupStatusLabels, candidate.status)} / 登録{" "}
                {formatDateTimeForDisplay(candidate.createdAt)}
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
