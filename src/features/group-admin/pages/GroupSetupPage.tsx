import { api } from "../../../../convex/_generated/api";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import { MAX_GROUP_NAME_LENGTH } from "../../../../lib/domain/groups/groupName";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function GroupSetupPage() {
  const navigate = useNavigate();
  const createGroup = useMutation(api.groups.mutations.createGroup);
  const [groupName, setGroupName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setError("グループ名を入力してください。");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      await createGroup({ name });
      navigate("/", { replace: true });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, "グループを作成できませんでした。"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h4">
              家族グループを作成
            </Typography>
            <Typography color="text.secondary">家計データはグループ単位で共有されます。</Typography>
          </Box>

          <Alert severity="info" variant="outlined">
            Clerk invitation で招待されたメンバーは、ログイン後にオーナーが設定画面から
            グループへ追加します。
          </Alert>

          {error ? (
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          ) : null}

          <Box component="form" onSubmit={handleCreate}>
            <Stack spacing={2}>
              <TextField
                autoFocus
                fullWidth
                label="グループ名"
                name="groupName"
                onChange={(event) => setGroupName(event.target.value)}
                slotProps={{ htmlInput: { maxLength: MAX_GROUP_NAME_LENGTH } }}
                value={groupName}
              />
              <Button
                disabled={isSaving}
                startIcon={isSaving ? <CircularProgress size={16} /> : <GroupAddIcon />}
                type="submit"
                variant="contained"
              >
                {isSaving ? "作成中..." : "グループを作成"}
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}
