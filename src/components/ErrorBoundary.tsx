import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6" dir="rtl">
          <div className="text-center max-w-md space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-bold text-foreground">حدث خطأ غير متوقع</h2>
            <p className="text-muted-foreground text-sm">
              نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="h-4 w-4 ml-2" />
                إعادة المحاولة
              </Button>
              <Button onClick={() => window.location.href = '/'} variant="outline">
                العودة للرئيسية
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
