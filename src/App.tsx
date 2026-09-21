import { useState } from "react";
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { RouterProvider } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { getClerkErrorMessage, useInitializeUser } from "./features/auth";
import { SiteCreditsFooter } from "./features/app-shell";
import { SuzumemoLoadingLogo, SuzumemoLoadingState } from "./features/ui";
import { router } from "./router";
import {
  E2E_APP_ERROR_BOUNDARY_PATH,
  MaintenancePage,
  OAUTH_CALLBACK_PATH,
  shouldShowMaintenancePage,
  shouldUseRouterBeforeAuth,
} from "./features/app-shell";
import "./App.css";

function E2eAppErrorBoundaryTrigger(): never {
  throw new Error("E2E error boundary trigger");
}

function App() {
  const pathname = window.location.pathname;

  if (import.meta.env.DEV && pathname === E2E_APP_ERROR_BOUNDARY_PATH) {
    return <E2eAppErrorBoundaryTrigger />;
  }
  if (pathname === OAUTH_CALLBACK_PATH) {
    return <AuthCallbackScreen />;
  }
  if (shouldShowMaintenancePage(pathname)) {
    return <MaintenancePage />;
  }
  if (shouldUseRouterBeforeAuth(pathname)) {
    return <RouterProvider router={router} />;
  }
  return <AuthenticatedApp />;
}

function AuthCallbackScreen() {
  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
          <AuthBrand />
          <Box aria-label="Googleログイン処理中" role="status">
            <SuzumemoLoadingLogo />
          </Box>
          <Box>
            <Typography component="h1" variant="h5">
              Googleログインを処理中
            </Typography>
            <Typography color="text.secondary" variant="body2">
              認証が完了したらSuzumemoに戻ります。
            </Typography>
          </Box>
          <AuthenticateWithRedirectCallback
            signInFallbackRedirectUrl="/"
            signUpFallbackRedirectUrl="/"
          />
        </Stack>
      </Paper>
    </Box>
  );
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isLoading: isConvexAuthLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  useInitializeUser();

  if (!isLoaded) {
    return (
      <SuzumemoLoadingState
        label="ログイン状態を確認中"
        message="ログイン状態を確認しています。"
        variant="fullscreen"
      />
    );
  }

  if (!isSignedIn) {
    return <SignedOutScreen />;
  }

  if (isConvexAuthLoading) {
    return (
      <SuzumemoLoadingState
        label="Convex認証状態を確認中"
        message="データ同期の認証状態を確認しています。"
        variant="fullscreen"
      />
    );
  }

  if (!isConvexAuthenticated) {
    return (
      <Box className="auth-screen">
        <Paper className="auth-panel paper-panel" elevation={0}>
          <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
            <AuthBrand />
            <Alert severity="error" variant="outlined">
              Clerkログインは完了していますが、Convexで認証できませんでした。
              ClerkのConvex連携とCLERK_JWT_ISSUER_DOMAINを確認してください。
            </Alert>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return <RouterProvider router={router} />;
}

function AuthBrand() {
  return (
    <Box
      alt="Suzumemo スズメモ"
      component="img"
      src="/suzumemo-logo-lockup.svg"
      sx={{ display: "block", height: "auto", mx: "auto", width: "min(220px, 72vw)" }}
    />
  );
}

function SignedOutScreen() {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!isLoaded) return;
    setError("");
    setIsRedirecting(true);
    try {
      await signIn.authenticateWithRedirect({
        redirectUrl: OAUTH_CALLBACK_PATH,
        redirectUrlComplete: "/",
        strategy: "oauth_google",
      });
    } catch (caughtError) {
      setError(
        getClerkErrorMessage(
          caughtError,
          "Googleログインを開始できませんでした。Clerk DashboardのGoogle OAuth設定を確認してください。",
        ),
      );
      setIsRedirecting(false);
    }
  };

  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={3} sx={{ alignItems: "center", textAlign: "center" }}>
          <AuthBrand />

          <Typography color="text.secondary">小さな支出と日々のメモを、軽く残せます。</Typography>

          {error ? (
            <Alert severity="error" variant="outlined">
              {error}
            </Alert>
          ) : null}

          <Button
            disabled={!isLoaded || isRedirecting}
            onClick={handleGoogleSignIn}
            size="large"
            variant="contained"
          >
            {isRedirecting ? "Googleへ移動しています" : "Googleでログイン"}
          </Button>

          <SiteCreditsFooter variant="ja" />
        </Stack>
      </Paper>
    </Box>
  );
}

export default App;
