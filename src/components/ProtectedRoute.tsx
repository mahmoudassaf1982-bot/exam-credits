import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const navigate = useNavigate();

  // Redirect to login immediately when session becomes null (after logout)
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth/login', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  // Wait for user profile to load before checking onboarding guards
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Onboarding guards: country selection → welcome page
  if (!user.countryId || user.countryId.length === 0) {
    return <Navigate to="/choose-country" replace />;
  }

  if (!user.welcomeSeen) {
    return <Navigate to="/welcome" replace />;
  }

  return <>{children}</>;
}
