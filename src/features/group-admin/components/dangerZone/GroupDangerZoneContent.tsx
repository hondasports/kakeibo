import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Divider,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useGroupDangerZone } from "../../hooks/useGroupDangerZone";
import { GroupMemberRemovalSection } from "./GroupMemberRemovalSection";
import { GroupOwnershipTransferSection } from "./GroupOwnershipTransferSection";
import { GroupDeleteSection } from "./GroupDeleteSection";
import { GroupDangerZoneDialogs } from "./GroupDangerZoneDialogs";

export function GroupDangerZoneContent() {
  const {
    group,
    groups,
    members,
    expanded,
    setExpanded,
    savingTarget,
    error,
    snackbar,
    setSnackbar,
    pendingRemoveMember,
    setPendingRemoveMember,
    pendingOwnershipTransfer,
    setPendingOwnershipTransfer,
    transferTargetUserId,
    setTransferTargetUserId,
    pendingDeleteGroup,
    setPendingDeleteGroup,
    deleteConfirmationName,
    setDeleteConfirmationName,
    removableMembers,
    transferableMembers,
    currentUserDisplayName,
    isBusy,
    handleConfirmRemoveMember,
    handleRequestOwnershipTransfer,
    handleConfirmOwnershipTransfer,
    handleConfirmDeleteGroup,
  } = useGroupDangerZone();

  if (group === undefined || groups === undefined || members === undefined) {
    return (
      <Stack aria-label="危険な操作を読み込んでいます" spacing={1.5}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <WarningAmberIcon color="error" />
          <Typography color="error" component="h2" variant="h5">
            危険な操作
          </Typography>
        </Stack>
        <Skeleton height={48} variant="rounded" />
      </Stack>
    );
  }
  if (group === null || group.role !== "owner") {
    return snackbar ? (
      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        open
      >
        <Alert onClose={() => setSnackbar("")} severity="success" variant="filled">
          {snackbar}
        </Alert>
      </Snackbar>
    ) : null;
  }

  return (
    <>
      <Accordion
        className="settings-danger-zone"
        data-testid="danger-zone-section"
        disableGutters
        elevation={0}
        expanded={expanded}
        onChange={(_, nextExpanded) => setExpanded(nextExpanded)}
      >
        <AccordionSummary
          aria-controls="danger-zone-content"
          expandIcon={<ExpandMoreIcon />}
          id="danger-zone-heading"
        >
          <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
            <WarningAmberIcon color="error" />
            <Typography color="error" component="h2" variant="h5">
              危険な操作
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails id="danger-zone-content">
          <Stack spacing={2.5}>
            {error ? (
              <Alert severity="error" variant="outlined">
                {error}
              </Alert>
            ) : null}

            <GroupMemberRemovalSection
              disabled={isBusy}
              members={removableMembers}
              onRequestRemove={setPendingRemoveMember}
            />

            <Divider />

            <GroupOwnershipTransferSection
              disabled={isBusy}
              transferableMembers={transferableMembers}
              transferTargetUserId={transferTargetUserId}
              onChangeTransferTarget={setTransferTargetUserId}
              onRequestTransfer={handleRequestOwnershipTransfer}
            />

            <Divider />

            <GroupDeleteSection
              disabled={isBusy}
              onRequestDelete={() => {
                setDeleteConfirmationName("");
                setPendingDeleteGroup(true);
              }}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <GroupDangerZoneDialogs
        currentUserDisplayName={currentUserDisplayName}
        deleteConfirmationName={deleteConfirmationName}
        pendingDeleteGroup={pendingDeleteGroup}
        pendingOwnershipTransfer={pendingOwnershipTransfer}
        pendingRemoveMember={pendingRemoveMember}
        savingTarget={savingTarget}
        onCancelDeleteGroup={() => setPendingDeleteGroup(false)}
        onCancelOwnershipTransfer={() => setPendingOwnershipTransfer(null)}
        onCancelRemoveMember={() => setPendingRemoveMember(null)}
        onConfirmDeleteGroup={handleConfirmDeleteGroup}
        onConfirmOwnershipTransfer={handleConfirmOwnershipTransfer}
        onConfirmRemoveMember={handleConfirmRemoveMember}
        onConfirmationNameChange={setDeleteConfirmationName}
      />

      <Snackbar
        anchorOrigin={{ horizontal: "center", vertical: "bottom" }}
        autoHideDuration={3000}
        onClose={() => setSnackbar("")}
        open={snackbar !== ""}
      >
        <Alert onClose={() => setSnackbar("")} severity="success" variant="filled">
          {snackbar}
        </Alert>
      </Snackbar>
    </>
  );
}
