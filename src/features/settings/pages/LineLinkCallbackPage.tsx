import { api } from "../../../../convex/_generated/api";
import { useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
export function LineLinkCallbackPage() {
  const [searchParams] = useSearchParams();
  const complete = useAction(api.lineLink.actions.complete);
  const navigate = useNavigate();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    const state = searchParams.get("state");
    const code = searchParams.get("code");
    if (!state || !code) {
      navigate("/settings?line=invalid", { replace: true });
      return;
    }
    void complete({ state, code })
      .then((result) => navigate(`/settings?line=${result.code}`, { replace: true }))
      .catch(() => navigate("/settings?line=failed", { replace: true }));
  }, [complete, navigate, searchParams]);

  return (
    <Box aria-live="polite" className="app-main" role="status" sx={{ textAlign: "center", py: 8 }}>
      <CircularProgress aria-label="LINE連携を確認中" />
      <Typography sx={{ mt: 2 }}>LINE連携を確認しています…</Typography>
    </Box>
  );
}
