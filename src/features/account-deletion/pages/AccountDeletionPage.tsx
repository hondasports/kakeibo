import { api } from "../../../../convex/_generated/api";
import { useState } from "react";
import { useUser } from "@clerk/react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { SuzumemoLoadingState } from "../../ui";
import { LEGAL_CONTACT_EMAIL } from "../../app-shell/lib/legalDocumentMeta";
import { AccountDeletionErrorBoundary } from "../components/AccountDeletionErrorBoundary";

function BackToSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} sx={{ alignSelf: "flex-start" }} variant="outlined">
      設定に戻る
    </Button>
  );
}

export function AccountDeletionPage() {
  return (
    <AccountDeletionErrorBoundary>
      <AccountDeletionPageContent />
    </AccountDeletionErrorBoundary>
  );
}

function AccountDeletionPageContent() {
  const preview = useQuery(api.accountDeletion.getAccountDeletionPreview);
  const requestDeletion = useMutation(api.accountDeletion.requestAccountDeletion);
  const setActiveGroup = useMutation(api.groups.mutations.setActiveGroup);
  const { user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const navigate = useNavigate();
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const backToSettings = () => navigate("/settings");
  if (preview === undefined)
    return (
      <SuzumemoLoadingState
        label="退会情報を読み込み中"
        message="退会の影響範囲を確認しています。"
        variant="page"
      />
    );
  if (preview.errorCode === "GROUP_MEMBERSHIP_INVARIANT")
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              アカウントを削除できません
            </Typography>
            <Alert severity="error">
              グループの設定に問題があるため、アカウント削除を開始できません。サポート（
              {LEGAL_CONTACT_EMAIL}）へお問い合わせください。
            </Alert>
            <BackToSettingsButton onClick={backToSettings} />
          </Stack>
        </Paper>
      </Box>
    );
  if (!preview.canDelete)
    return (
      <Box className="app-main">
        <Paper className="settings-ledger" elevation={0}>
          <Stack spacing={2.5}>
            <Typography component="h1" variant="h5">
              アカウントを削除できません
            </Typography>
            <Typography color="text.secondary">
              退会する前に対応が必要なグループがあります。あなたが唯一のオーナーになっているグループでは、先に別のメンバーへオーナー権限を譲渡してください。
            </Typography>
            <List>
              {preview.blockingGroups.map((group) => (
                <ListItem key={group.groupId} disableGutters>
                  <Stack spacing={0.5} sx={{ width: "100%" }}>
                    <Typography>{group.groupName}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      唯一のオーナーです・メンバー {group.memberCount}人
                    </Typography>
                    <Button
                      onClick={async () => {
                        try {
                          await setActiveGroup({ groupId: group.groupId as never });
                          navigate("/settings");
                        } catch {
                          setError("グループを切り替えられませんでした。もう一度お試しください。");
                        }
                      }}
                      sx={{ alignSelf: "flex-start" }}
                      variant="outlined"
                    >
                      グループ設定を開く
                    </Button>
                  </Stack>
                </ListItem>
              ))}
            </List>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <BackToSettingsButton onClick={backToSettings} />
          </Stack>
        </Paper>
      </Box>
    );
  const normalizedEmail = confirmationEmail.trim().toLowerCase();
  const emailMatches = accountEmail === "" || normalizedEmail === accountEmail.toLowerCase();
  const canSubmit = confirmationText === "削除" && emailMatches;
  return (
    <Box className="app-main">
      <Paper className="settings-ledger" elevation={0}>
        <Stack spacing={2.5}>
          <Typography component="h1" variant="h5">
            アカウントを削除します
          </Typography>
          <Alert severity="warning">
            Suzumemoのアカウントを完全に削除します。この操作は取り消せません。
          </Alert>
          {preview.groupsToLeave.length > 0 ? (
            <Box>
              <Typography variant="h6">以下の共有グループから外れます</Typography>
              <List>
                {preview.groupsToLeave.map((group) => (
                  <ListItem key={group.groupId} disableGutters>
                    ・{group.groupName}
                  </ListItem>
                ))}
              </List>
              <Typography color="text.secondary" variant="body2">
                これらのグループに登録されている家計データは削除されません。
              </Typography>
            </Box>
          ) : null}
          {preview.groupsToDelete.length > 0 ? (
            <Box>
              <Typography variant="h6">以下のグループと家計データは完全に削除されます</Typography>
              <List>
                {preview.groupsToDelete.map((group) => (
                  <ListItem key={group.groupId} disableGutters>
                    ・{group.groupName}
                  </ListItem>
                ))}
              </List>
              <Typography color="text.secondary" variant="body2">
                支出、収入、カテゴリ、レシート画像、AI下書きなどの関連データも削除され、復元できません。
              </Typography>
            </Box>
          ) : null}
          <Typography color="text.secondary">
            Suzumemoのアカウントとログイン情報も削除されます。退会完了後は、現在のアカウントでログインできません。
          </Typography>
          <TextField
            helperText="誤操作を防ぐため「削除」と入力してください"
            label="確認用入力"
            onChange={(event) => setConfirmationText(event.target.value)}
            value={confirmationText}
          />
          {accountEmail !== "" ? (
            <TextField
              helperText={`本人確認のため、ログイン中のメールアドレス（${accountEmail}）を入力してください`}
              label="メールアドレス入力"
              onChange={(event) => setConfirmationEmail(event.target.value)}
              type="email"
              value={confirmationEmail}
            />
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Button
            color="error"
            disabled={!canSubmit || submitting}
            onClick={async () => {
              setSubmitting(true);
              setError("");
              try {
                await requestDeletion({ confirmationText });
                navigate("/settings/account/delete/status", { replace: true });
              } catch {
                setError(
                  "アカウント削除を開始できませんでした。内容を確認してもう一度お試しください。",
                );
                setSubmitting(false);
              }
            }}
            variant="contained"
          >
            {submitting ? <CircularProgress color="inherit" size={20} /> : "アカウントを削除する"}
          </Button>
          <BackToSettingsButton onClick={backToSettings} />
        </Stack>
      </Paper>
    </Box>
  );
}
