import { Component, type ErrorInfo, type ReactNode } from "react";
import { Typography } from "@mui/material";
import { designTokens } from "../../../designTokens";
import { PublicStatusPage } from "./PublicStatusPage";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary caught an error", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign("/");
  };

  render() {
    if (this.state.error) {
      const showDetails = import.meta.env.DEV;

      return (
        <PublicStatusPage
          description="画面の表示中にエラーが発生しました。再読み込みしても直らない場合は、時間をおいてもう一度お試しください。"
          headerBrand={{
            alt: "Suzumemo",
            src: "/suzumemo-app-icon.svg",
            variant: "panel",
            width: 56,
          }}
          label="Application Error"
          labelTone="error"
          primaryAction={{ label: "再読み込み", onClick: this.handleReload }}
          role="alert"
          secondaryActions={[{ label: "ホームへ戻る", onClick: this.handleGoHome }]}
          title="問題が発生しました"
        >
          {showDetails ? (
            <Typography
              component="pre"
              sx={{
                color: designTokens.color.error.main,
                fontSize: 12,
                maxWidth: "100%",
                overflow: "auto",
                textAlign: "left",
                whiteSpace: "pre-wrap",
              }}
              variant="body2"
            >
              {this.state.error.message}
            </Typography>
          ) : null}
        </PublicStatusPage>
      );
    }

    return this.props.children;
  }
}
