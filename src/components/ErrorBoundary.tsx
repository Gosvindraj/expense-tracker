import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Per-screen boundary: a render error in one tab shouldn't blank the app.
 *
 * All five screens stay mounted at once, so without this a single bad panel
 * takes the whole tree — including the tab bar — down with it, leaving no way
 * to navigate to a working screen.
 */
export default class ErrorBoundary extends Component<
  { name: string; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] render failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen-error">
        <h3>{this.props.name} couldn't load</h3>
        <p className="muted">{this.state.error.message}</p>
        <div className="row">
          <button type="button" className="quiet" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
