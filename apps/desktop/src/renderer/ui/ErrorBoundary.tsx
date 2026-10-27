import { TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

interface Props {
  /** What crashed, e.g. "the Git view". */
  label: string;
  children: ReactNode;
  /** Extra actions, e.g. "Disable" / "Fix with AI" for add-on contributions. */
  actions?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error) => void;
}

/** Contains a crash to one view, tab or contribution — never the whole app. */
export class ErrorBoundary extends Component<Props, { error: Error | undefined }> {
  override state = { error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} crashed`, error, info.componentStack);
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: undefined });

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="m-2 flex flex-col gap-2 rounded-md border border-line bg-danger-soft p-3 text-sm"
      >
        <div className="flex items-center gap-2 font-medium text-danger">
          <TriangleAlert className="size-4" /> {this.props.label} stopped working
        </div>
        <div className="selectable font-mono text-xs break-words text-muted">{error.message}</div>
        <div className="flex gap-2">
          <Button size="sm" onClick={this.reset}>
            Try again
          </Button>
          {this.props.actions?.(error, this.reset)}
        </div>
      </div>
    );
  }
}
