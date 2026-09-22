import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@clerk/react";
import { useConvexAuth, useQuery } from "convex/react";
import { SuzumemoLoadingState } from "../../ui";
import { SystemAdminAuthState } from "./SystemAdminAuthState";
import { SystemAdminErrorBoundary } from "./SystemAdminErrorBoundary";
import { SystemAdminLayout } from "./SystemAdminLayout";

export function SystemAdminRouteGuard() {
  return (
    <SystemAdminErrorBoundary
      label="SystemAdminRouteGuard"
      renderError={() => (
        <SystemAdminAuthState
          action={{ label: "再読み込み", onClick: () => window.location.reload() }}
          severity="error"
          title="管理画面を利用できません"
        />
      )}
    >
      <SystemAdminRouteGuardContent />
    </SystemAdminErrorBoundary>
  );
}

function SystemAdminRouteGuardContent() {
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const { isLoading: isConvexLoading, isAuthenticated } = useConvexAuth();
  const context = useQuery(
    api.systemAdmins.getMySystemAdminContext,
    isClerkLoaded && isSignedIn && isAuthenticated ? {} : "skip",
  );

  if (
    !isClerkLoaded ||
    isConvexLoading ||
    (isSignedIn && isAuthenticated && context === undefined)
  ) {
    return (
      <SuzumemoLoadingState
        label="管理者権限を確認中"
        message="システム管理者権限を確認しています。"
        variant="fullscreen"
      />
    );
  }

  if (!isSignedIn || !isAuthenticated || context?.status !== "active") {
    return (
      <SystemAdminAuthState
        action={{ label: "通常の画面へ戻る", to: "/" }}
        message="システム管理者権限が必要です。権限の状態は表示せず、安全に通常の画面へ戻ります。"
        severity="warning"
        title="管理画面を利用できません"
      />
    );
  }

  return <SystemAdminLayout environment={context.environment} />;
}
