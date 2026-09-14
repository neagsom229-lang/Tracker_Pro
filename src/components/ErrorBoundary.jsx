import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * ErrorBoundary
 * -------------
 * Class component because React only supports error boundaries via
 * `componentDidCatch` / `getDerivedStateFromError` — there's no hook
 * equivalent (yet). Wrapping <App /> in this means a crash in any one
 * component (a bad chart render, a malformed date, etc.) shows a calm
 * recovery screen instead of a blank white page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // In production you'd forward this to an error-tracking service
    // (Sentry, LogRocket, etc.) — logging is the minimum viable version.
    console.error('Obsidian crashed:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="glass-strong rounded-3xl p-8 max-w-sm text-center shadow-glass">
            <div className="w-12 h-12 rounded-2xl bg-expense-soft flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={22} className="text-expense" />
            </div>
            <h1 className="text-lg font-semibold text-slate-50 mb-1">Something went wrong</h1>
            <p className="text-sm text-slate-400 mb-6">
              Obsidian hit an unexpected error. Your data is safe — reloading usually fixes this.
            </p>
            <button onClick={this.handleReload} className="gilt-btn rounded-xl px-5 py-2.5 text-sm w-full">
              Reload the app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
