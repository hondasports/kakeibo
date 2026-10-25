import { Alert, Box, Paper } from "@mui/material";
import { GroupInvitationAcceptView } from "../components/GroupInvitationAcceptView";
import { useGroupInvitationAccept } from "../hooks/useGroupInvitationAccept";

export function GroupInvitationAcceptPage() {
  const {
    invitation,
    needsGroupSwitch,
    switchActiveGroup,
    setSwitchActiveGroup,
    handleAcceptInvitation,
    error,
    firstName,
    handleProfileDetailsSubmit,
    handleAccountSwitch,
    isCompletingInvitation,
    lastName,
    missingProfileFields,
    needsProfileDetails,
    needsAccountSwitch,
    setFirstName,
    setLastName,
    token,
  } = useGroupInvitationAccept();

  if (!token) {
    return (
      <Box className="auth-screen">
        <Paper className="auth-panel paper-panel" elevation={0}>
          <Alert severity="error" variant="outlined">
            招待トークンが見つかりませんでした。
          </Alert>
        </Paper>
      </Box>
    );
  }

  return (
    <GroupInvitationAcceptView
      invitation={invitation}
      needsGroupSwitch={needsGroupSwitch}
      switchActiveGroup={switchActiveGroup}
      onSwitchActiveGroupChange={setSwitchActiveGroup}
      onAcceptInvitation={handleAcceptInvitation}
      error={error}
      firstName={firstName}
      isCompletingInvitation={isCompletingInvitation}
      lastName={lastName}
      missingProfileFields={missingProfileFields}
      needsProfileDetails={needsProfileDetails}
      needsAccountSwitch={needsAccountSwitch}
      onAccountSwitch={handleAccountSwitch}
      onFirstNameChange={setFirstName}
      onLastNameChange={setLastName}
      onProfileDetailsSubmit={handleProfileDetailsSubmit}
    />
  );
}
