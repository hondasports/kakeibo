import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Button, Stack } from "@mui/material";

type Props = {
  children: ReactNode;
  message: string;
};

type State = {
  error: Error | null;
};

/**
 * サマリー画面のセクション単位のエラーバウンダリ。
 * Convex の useQuery が throw したエラーをここで受け止め、
 * ナビゲーションを残したままページ内エラー＋再試行を表示する。
 * 再試行は子ツリーを再マウントするので、useQuery が再実行される。
 */
export class SummarySectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("SummarySectionErrorBoundary caught an error", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Stack spacing={1.5}>
          <Alert severity="error" variant="outlined">
            {this.props.message}
          </Alert>
          <Button onClick={this.handleRetry} sx={{ alignSelf: "flex-start" }} variant="outlined">
            再試行
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}
