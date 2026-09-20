import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import {
  getLineLinkStatusApi,
  startLineLinkApi,
  unlinkLineLinkApi,
} from "../../../lib/repositories/lineLink";

type FeedbackCode = "success" | "expired" | "invalid" | "conflict" | "failed";
type LineLinkNavigationState = { lineLinkFeedback?: unknown };

const feedbackMessages: Record<FeedbackCode, { message: string; severity: "success" | "error" }> = {
  success: { message: "LINEアカウントを連携しました", severity: "success" },
  expired: { message: "連携の有効期限が切れました。もう一度お試しください", severity: "error" },
  invalid: { message: "LINE連携を確認できませんでした。もう一度お試しください", severity: "error" },
  conflict: {
    message: "このLINEアカウントはすでに別のアカウントと連携されています",
    severity: "error",
  },
  failed: { message: "LINE連携を完了できませんでした。もう一度お試しください", severity: "error" },
};

function isFeedbackCode(value: string | null): value is FeedbackCode {
  return (
    value === "success" ||
    value === "expired" ||
    value === "invalid" ||
    value === "conflict" ||
    value === "failed"
  );
}

function getNavigationFeedback(state: unknown): FeedbackCode | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as LineLinkNavigationState).lineLinkFeedback;
  return typeof value === "string" && isFeedbackCode(value) ? value : null;
}

export function LineLinkSettingsPanel() {
  const status = useQuery(getLineLinkStatusApi());
  const start = useAction(startLineLinkApi());
  const unlink = useMutation(unlinkLineLinkApi());
  const [searchParams] = useSearchParams();
  const feedbackQuery = searchParams.get("line");
  const location = useLocation();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackCode | null>(() =>
    isFeedbackCode(feedbackQuery) ? feedbackQuery : getNavigationFeedback(location.state),
  );

  const [prevFeedbackQuery, setPrevFeedbackQuery] = useState(feedbackQuery);
  if (prevFeedbackQuery !== feedbackQuery) {
    setPrevFeedbackQuery(feedbackQuery);
    if (isFeedbackCode(feedbackQuery)) {
      setFeedback(feedbackQuery);
    }
  }

  useEffect(() => {
    if (!isFeedbackCode(feedbackQuery)) return;
    navigate(location.pathname, {
      replace: true,
      state: { lineLinkFeedback: feedbackQuery },
    });
  }, [feedbackQuery, location.pathname, navigate]);

  if (status === undefined) {
    return (
      <Stack aria-label="LINE連携を読み込んでいます" spacing={2}>
        <Skeleton height={30} width="30%" />
        <Skeleton height={48} variant="rounded" />
      </Stack>
    );
  }

  const linked = status.status === "linked";
  const beginLink = async () => {
    setStarting(true);
    setFeedback(null);
    try {
      const { authorizationUrl } = await start({});
      window.location.assign(authorizationUrl);
    } catch {
      setFeedback("failed");
      setStarting(false);
    }
  };
  const confirmUnlink = async () => {
    setUnlinking(true);
    try {
      await unlink({});
      setConfirmOpen(false);
      setFeedback(null);
    } catch {
      setFeedback("failed");
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h2" variant="h5">
          LINE連携
        </Typography>
        <Typography color="text.secondary" variant="body2">
          LINEから家計を確認できるように、あなたのLINEアカウントを連携します。
        </Typography>
      </Box>

      <Box className="settings-row">
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700 }} variant="body2">
              {linked ? "LINEアカウントは連携されています" : "LINEアカウントは連携されていません"}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {linked
                ? "解除すると、LINEからこの家計簿を参照できなくなります。"
                : "連携時にLINE Loginの認証画面へ移動します。"}
            </Typography>
          </Box>
          {linked ? (
            <Button
              disabled={unlinking}
              onClick={() => setConfirmOpen(true)}
              sx={{ minHeight: 44 }}
              variant="outlined"
            >
              {unlinking ? "解除中…" : "連携を解除する"}
            </Button>
          ) : (
            <Button
              disabled={starting}
              onClick={() => void beginLink()}
              sx={{ minHeight: 44 }}
              variant="contained"
            >
              {starting ? (
                <>
                  <CircularProgress aria-hidden="true" color="inherit" size={20} />
                  <span>連携を開始中…</span>
                </>
              ) : (
                "LINEと連携する"
              )}
            </Button>
          )}
        </Stack>
      </Box>

      {feedback ? (
        <Alert
          aria-live="polite"
          onClose={() => setFeedback(null)}
          severity={feedbackMessages[feedback].severity}
        >
          {feedbackMessages[feedback].message}
        </Alert>
      ) : null}

      <Dialog
        fullWidth
        maxWidth="xs"
        onClose={() => !unlinking && setConfirmOpen(false)}
        open={confirmOpen}
      >
        <DialogTitle>LINE連携を解除しますか？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            解除後はLINEから家計簿を参照できません。LINE側のアカウントやメッセージは削除されません。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={unlinking} onClick={() => setConfirmOpen(false)} sx={{ minHeight: 44 }}>
            キャンセル
          </Button>
          <Button
            color="error"
            disabled={unlinking}
            onClick={() => void confirmUnlink()}
            sx={{ minHeight: 44 }}
            variant="contained"
          >
            {unlinking ? "解除中…" : "解除する"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
