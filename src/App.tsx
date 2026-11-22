import { useSignOutState } from "./features/auth/hooks/signOutState";
import { useEffect, useState } from "react";
import { AuthenticateWithRedirectCallback, useAuth, useClerk } from "@clerk/react";
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
  const { pending: isSigningOut } = useSignOutState();
  if (isSigningOut) {
    return (
      <SuzumemoLoadingState
        label="ログアウト中"
        message="ログアウトしています。"
        variant="fullscreen"
      />
    );
  }
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

const OAUTH_CALLBACK_STALL_MS = 20000;

function AuthCallbackScreen() {
  const [isStalled, setIsStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsStalled(true), OAUTH_CALLBACK_STALL_MS);
    return () => window.clearTimeout(timer);
  }, []);

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
          {isStalled ? (
            <Alert severity="info" variant="outlined">
              ログイン処理に時間がかかっています。この画面が進まない場合は、ログイン画面からもう一度お試しください。
            </Alert>
          ) : null}
          {isStalled ? (
            <Button component="a" href="/" variant="outlined">
              ログイン画面に戻る
            </Button>
          ) : null}
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
  const { initializationError, retryInitialization } = useInitializeUser();

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
    return <ConvexAuthFailureScreen />;
  }

  if (initializationError) {
    return (
      <Box className="auth-screen">
        <Paper className="auth-panel paper-panel" elevation={0}>
          <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
            <AuthBrand />
            <Alert severity="error" variant="outlined">
              アカウントの初期化に失敗しました。通信状況を確認して、もう一度お試しください。
            </Alert>
            <Button onClick={retryInitialization} variant="contained">
              もう一度試す
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return <RouterProvider router={router} />;
}

function ConvexAuthFailureScreen() {
  const clerk = useClerk();
  const [isSigningOutForRetry, setIsSigningOutForRetry] = useState(false);

  const handleSignOutForRetry = async () => {
    setIsSigningOutForRetry(true);
    try {
      await clerk.signOut({ redirectUrl: "/" });
    } catch (caughtError) {
      console.error("signOut for retry failed:", caughtError);
      window.location.assign("/");
    }
  };

  return (
    <Box className="auth-screen">
      <Paper className="auth-panel paper-panel" elevation={0}>
        <Stack spacing={2.5} sx={{ alignItems: "center", textAlign: "center" }}>
          <AuthBrand />
          <Alert severity="error" variant="outlined">
            ログインは完了しましたが、データ同期の準備に失敗しました。
            時間をおいてもう一度お試しいただくか、一度ログアウトしてログインし直してください。
          </Alert>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button onClick={() => window.location.reload()} variant="contained">
              再読み込み
            </Button>
            <Button
              disabled={isSigningOutForRetry}
              onClick={handleSignOutForRetry}
              variant="outlined"
            >
              {isSigningOutForRetry ? "ログアウトしています" : "ログアウトしてログインし直す"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
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
          "Googleログインを開始できませんでした。通信状況を確認して、もう一度お試しください。",
          { userFacingOnly: true },
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

          <Box>
            <Typography color="text.secondary" variant="body2">
              招待を受けた方は、同じボタンからGoogleアカウントで登録へ進めます（招待制です）。
            </Typography>
            <Typography color="text.secondary" variant="body2">
              ログインまたは登録を進めると、利用規約とプライバシーポリシーに同意したものとみなします。
            </Typography>
          </Box>

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
