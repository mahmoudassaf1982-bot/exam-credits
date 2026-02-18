import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Wallet,
  UserPlus,
  ShoppingCart,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PointsBadge } from '@/components/PointsBadge';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/app', label: 'لوحة التحكم', icon: LayoutDashboard },
  { path: '/app/exams', label: 'الاختبارات', icon: BookOpen },
  { path: '/app/wallet', label: 'المحفظة', icon: Wallet },
  { path: '/app/referral', label: 'دعوة صديق', icon: UserPlus },
  { path: '/app/topup', label: 'شراء نقاط', icon: ShoppingCart },
];

const adminNavItems = [
  { path: '/app/admin/ai-generator', label: 'توليد الأسئلة بالذكاء الاصطناعي', icon: Sparkles },
  { path: '/app/admin/exams', label: 'إدارة الاختبارات', icon: BookOpen },
  { path: '/app/admin/users', label: 'إدارة المستخدمين', icon: Users },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-72 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground font-black text-lg">
              S
            </div>
            <div>
              <h1 className="text-base font-bold text-sidebar-accent-foreground">Saris Exams</h1>
              <p className="text-xs text-sidebar-muted">منصة الاختبارات</p>
            </div>
          </div>
          <button
            className="lg:hidden rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Points badge */}
        <div className="px-5 pt-4">
          <PointsBadge />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {isActive && (
                  <ChevronLeft className="mr-auto h-4 w-4 opacity-60" />
                )}
              </Link>
            );
          })}

          {/* Admin section */}
          {user?.isAdmin && (
            <>
              <div className="my-3 border-t border-sidebar-border" />
              <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted">
                الإدارة
              </p>
              {adminNavItems.map((item) => {
                const isActive = item.path === '/app/admin'
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* User info */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground font-bold text-sm">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sidebar-accent-foreground truncate">
                {user?.name}
              </p>
              <p className="text-xs text-sidebar-muted truncate">
                {user?.countryName} {countries[user?.countryId || ''] || ''}
              </p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-gold text-gold-foreground font-black text-sm">
              S
            </div>
            <span className="font-bold text-foreground">Saris Exams</span>
          </div>
          <div className="flex items-center gap-3">
            <PointsBadge compact />
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 hover:bg-muted transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

const countries: Record<string, string> = {
  sa: '🇸🇦',
  ae: '🇦🇪',
  kw: '🇰🇼',
  bh: '🇧🇭',
  om: '🇴🇲',
  qa: '🇶🇦',
};
