import { api } from "../../../../convex/_generated/api";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useGroupMembership } from "../hooks/useGroupMembership";
import { SuzumemoLoadingState } from "../../ui";

type MyGroup = {
  _id: string;
  name: string;
  role: "owner" | "member";
  createdAt: number;
  isActive: boolean;
};

export function GroupSelectPage() {
  const navigate = useNavigate();
  const { groups, hasGroups, isLoading } = useGroupMembership();
  const setActiveGroup = useMutation(api.groups.mutations.setActiveGroup);

  if (isLoading) {
    return (
      <SuzumemoLoadingState
        label="所属グループを確認中"
        message="所属グループを確認しています。"
        variant="fullscreen"
      />
    );
  }

  if (!hasGroups) {
    return <Navigate to="/group/setup" replace />;
  }

  const typedGroups = (groups ?? []) as MyGroup[];

  const handleSelect = async (groupId: string) => {
    await setActiveGroup({ groupId: groupId as never });
    navigate("/", { replace: true });
  };

  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h4">
              グループを選択
            </Typography>
            <Typography color="text.secondary">
              複数のグループに所属しています。使いたいグループを選んでください。
            </Typography>
          </Box>

          <Stack spacing={1.5}>
            {typedGroups.map((group) => (
              <Paper key={group._id} className="paper-panel" elevation={0}>
                <Box sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
                  >
                    <Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <Typography sx={{ fontWeight: 700 }} variant="h6">
                          {group.name}
                        </Typography>
                        {group.isActive ? (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <CheckCircleIcon color="primary" fontSize="small" />
                            <Typography color="primary.main" variant="body2">
                              現在のグループ
                            </Typography>
                          </Stack>
                        ) : null}
                      </Stack>
                      <Typography color="text.secondary" variant="body2">
                        {group.role === "owner" ? "オーナー" : "メンバー"}
                      </Typography>
                    </Box>

                    <Button
                      disabled={group.isActive}
                      onClick={() => handleSelect(group._id)}
                      variant={group.isActive ? "outlined" : "contained"}
                    >
                      {group.isActive ? "選択中" : "このグループを使う"}
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>

          <Alert severity="info" variant="outlined">
            新しいグループを作る場合は、いったん作成後にそのグループがアクティブになります。
          </Alert>

          <Button onClick={() => navigate("/group/setup")} variant="text">
            新しいグループを作成
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
