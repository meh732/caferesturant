import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  reportName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ReportErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Report Error Boundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 border border-red-200/80 shadow-[0_4px_24px_rgba(239,68,68,0.06)] text-right space-y-4 my-4" dir="rtl">
          <div className="flex items-center gap-3 text-red-600">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-base text-neutral-900">
                خطا در نمایش {this.props.reportName || 'گزارش'}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                یک مشکل غیرمنتظره در محاسبه یا نمایش داده‌ها رخ داده است. اطلاعات قبلی محفوظ است.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="p-3 bg-red-50/80 rounded-xl border border-red-100 text-[11px] font-mono text-red-800 break-all leading-relaxed dir-ltr">
              {this.state.error.message || String(this.state.error)}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
            >
              <RefreshCw size={14} />
              <span>تلاش مجدد</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              بازنویسی صفحه
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
