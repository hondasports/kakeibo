import { Box, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import CancelIcon from "@mui/icons-material/Cancel";
import {
  getInvitationSentAtLabel,
  getInvitationStatusLabel,
  type GroupPendingInvitationListItem,
} from "../utils/groupInvitationDisplay";

type GroupPendingInvitationListProps = {
  invitations: GroupPendingInvitationListItem[];
  savingTarget?: string | null;
  onRequestCancel?: (invitation: GroupPendingInvitationListItem) => void;
};

export function GroupPendingInvitationList({
  invitations,
  savingTarget = null,
  onRequestCancel,
}: GroupPendingInvitationListProps) {
  if (invitations.length === 0) {
    return (
      <Box
        data-testid="group-pending-invitation-list-empty"
        sx={{
          p: 1.5,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography color="text.secondary" variant="body2">
          送信済みの招待はありません。
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      component="ul"
      className="group-pending-invitation-list"
      data-testid="group-pending-invitation-list"
    >
      {invitations.map((invitation) => (
        <Box className="group-member-row" component="li" key={invitation._id}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                {invitation.email}
              </Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: "anywhere" }} variant="body2">
                {getInvitationSentAtLabel(invitation.createdAt)}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip
              color="warning"
              label={getInvitationStatusLabel(invitation.status)}
              size="small"
              variant="outlined"
            />
            {onRequestCancel ? (
              <Tooltip title="招待を取り消す">
                <span>
                  <IconButton
                    aria-label={`${invitation.email}への招待を取り消す`}
                    color="error"
                    disabled={savingTarget !== null}
                    onClick={() => onRequestCancel(invitation)}
                    size="small"
                  >
                    {savingTarget === invitation._id ? (
                      <CircularProgress size={18} />
                    ) : (
                      <CancelIcon fontSize="small" />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}
