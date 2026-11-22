import { Alert, List, ListItem, Paper, Typography } from "@mui/material";
import type { UserDetail } from "../hooks/useSystemAdminUserDetail";
import { displayLabel, invitationStatusLabels } from "../lib/displayLabels";

type UserInvitationsSectionProps = {
  invitations: UserDetail["invitations"];
  invitationsTruncated?: boolean;
};

export function UserInvitationsSection({
  invitations,
  invitationsTruncated,
}: UserInvitationsSectionProps) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h3" variant="h6">
        招待状態
      </Typography>
      {invitations.length ? (
        <List>
          {invitations.map((invitation) => (
            <ListItem key={invitation.groupId}>
              {invitation.groupName}（{invitation.groupId}） /{" "}
              {displayLabel(invitationStatusLabels, invitation.status)}
            </ListItem>
          ))}
        </List>
      ) : (
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          招待情報はありません。
        </Typography>
      )}
      {invitationsTruncated ? (
        <Alert severity="warning">
          招待情報は上限20件まで表示しています（{invitations.length}件を表示）。
        </Alert>
      ) : null}
    </Paper>
  );
}
