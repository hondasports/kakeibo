import { Component, type ErrorInfo, type ReactNode } from "react";

type SystemAdminErrorBoundaryProps = {
  children: ReactNode;
  label: string;
  renderError: (retry: () => void) => ReactNode;
};

type State = { hasError: boolean };

export class SystemAdminErrorBoundary extends Component<SystemAdminErrorBoundaryProps, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`[${this.props.label}] query failed`, _error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.renderError(() => this.setState({ hasError: false }));
    }
    return this.props.children;
  }
}
