import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen bg-void flex items-center justify-center">
            <div className="panel glow-red p-6 max-w-md text-center">
              <p className="font-data text-[11px] uppercase tracking-wider text-oxide mb-3">
                Something went wrong
              </p>
              <p className="text-sm text-silver mb-4">{this.state.error.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => this.setState({ error: null })}
                className="font-data text-[11px] text-silver hover:text-fog"
              >
                TRY AGAIN
              </Button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
