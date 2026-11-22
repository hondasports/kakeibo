import { Component, type ErrorInfo, type ReactNode } from "react";
import { Alert, Box, Button, Stack } from "@mui/material";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * 退会関連画面のクエリ失敗を受け止め、再読み込み導線を出す境界。
 * Convex の useQuery は失敗時に throw するため、画面単位で囲う。
 */
export class AccountDeletionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AccountDeletionErrorBoundary caught an error", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <Box className="app-main">
          <Stack spacing={1.5}>
            <Alert severity="error" variant="outlined">
              退会情報を読み込めませんでした。通信状況を確認して、もう一度お試しください。
            </Alert>
            <Button onClick={this.handleRetry} sx={{ alignSelf: "flex-start" }} variant="outlined">
              もう一度試す
            </Button>
          </Stack>
        </Box>
      );
    }

    return this.props.children;
  }
}
