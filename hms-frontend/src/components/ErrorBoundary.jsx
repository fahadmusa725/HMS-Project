import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Last line of defence for the whole app: an uncaught render error shows a readable
 * recovery screen instead of a blank white page. This has to stay a class component -
 * there is no hook equivalent of componentDidCatch.
 *
 * It sits inside the router so a crash in one page keeps the URL, and "Try again"
 * re-renders the same tree without a full reload.
 */
export class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Unhandled render error:', error, info?.componentStack);
  }

  handleRetry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="min-h-screen bg-background text-foreground flex items-center justify-center p-4"
        role="alert"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-soft-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-foreground">Something went wrong</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This page hit an unexpected error. Try again, or reload the page to start over.
          </p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={this.handleRetry}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.assign('/')}>
              Go to home page
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-2 text-muted-foreground"
          >
            Reload page
          </Button>

          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-muted p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
              {String(error?.stack || error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
