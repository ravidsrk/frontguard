import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/** App-level error boundary. Restyled to the new design tokens. */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Frontguard] Render error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen items-center justify-center bg-canvas p-8">
            <div className="text-center">
              <h1 className="font-sans text-[24px] font-bold text-ink-hi">Something went wrong</h1>
              <p className="mt-2 text-[15px] text-ink-mid">Please refresh the page to try again.</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-5 bg-amber px-5 py-2.5 font-mono text-[13px] font-medium text-canvas transition-colors hover:bg-amber-hover cursor-pointer"
              >
                Refresh page
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
