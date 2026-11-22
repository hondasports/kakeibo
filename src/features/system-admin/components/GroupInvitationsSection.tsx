import { Alert, Button, List, ListItem, Paper, Stack, Typography } from "@mui/material";
import type { GroupDetail, GroupDetailInvitation } from "../hooks/useSystemAdminGroupDetail";
import { formatDateTimeForDisplay } from "../../../utils/date";
import { displayLabel, invitationStatusLabels } from "../lib/displayLabels";

type GroupInvitationsSectionProps = {
  invitations: GroupDetail["invitations"];
  invitationsTruncated?: boolean;
  stale: boolean;
  onRequestRevoke: (invitation: GroupDetailInvitation) => void;
};

export function GroupInvitationsSection({
  invitations,
  invitationsTruncated,
  stale,
  onRequestRevoke,
}: GroupInvitationsSectionProps) {
  return (
    <Paper sx={{ p: 2 }} variant="outlined">
      <Typography component="h3" variant="h6">
        招待状態
      </Typography>
      {invitations.length ? (
        <List>
          {invitations.map((invitation) => (
            <ListItem key={invitation.id} sx={{ display: "block" }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ alignItems: { xs: "flex-start", sm: "center" } }}
              >
                <Typography sx={{ flex: 1 }}>
                  {invitation.email} / {displayLabel(invitationStatusLabels, invitation.status)} /{" "}
                  {formatDateTimeForDisplay(invitation.createdAt)}
                </Typography>
                {invitation.status === "pending" ? (
                  <Button
                    color="error"
                    disabled={stale}
                    onClick={() => onRequestRevoke(invitation)}
                    size="small"
                    variant="outlined"
                  >
                    保留中の招待を取り消す
                  </Button>
                ) : null}
              </Stack>
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
