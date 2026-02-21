import React, { Component } from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || 'Unknown error';
      const title = this.props.fallbackTitle || 'Something went wrong';

      return (
        <div style={{
          padding: '24px',
          margin: '16px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#fca5a5',
          fontFamily: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <strong style={{ fontSize: '16px', color: '#f87171' }}>{title}</strong>
          </div>
          <p style={{ fontSize: '13px', margin: '0 0 12px', opacity: 0.85, lineHeight: 1.5 }}>
            This is likely caused by incorrectly formatted data in a definition. Check the admin panel for entries with missing or malformed fields.
          </p>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#fca5a5',
            wordBreak: 'break-word',
            marginBottom: '12px',
          }}>
            {msg}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: '6px 16px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '6px',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
