import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred in Nova.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Nova ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string };
        if (parsed.error) {
          friendly = `Cloud Sync (${parsed.operationType || 'operation'}): ${parsed.error}`;
        }
      } catch {
        // plain text error
      }

      return (
        <div className="min-h-screen bg-[#06040C] text-[#F4F1FA] flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-3xl border border-violet-400/20 bg-[#120D1F] p-6 text-center space-y-4 shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold text-white">Nova Recovery Mode</h1>
            <p className="text-xs text-slate-300 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-5 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reload Nova</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
