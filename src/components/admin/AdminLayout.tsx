import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import {
  LayoutDashboard,
  Globe,
  BookOpen,
  HelpCircle,
  Coins,
  Crown,
  Settings,
  Sparkles,
  Users,
  BarChart2,
  ArrowRight,
  Menu,
  X,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const adminNavItems = [
  { path: '/app/admin', label: 'لوحة التحكم', icon: LayoutDashboard, exact: true },
  { path: '/app/admin/stats', label: 'الإحصائيات', icon: BarChart2 },
  { path: '/app/admin/content', label: 'المحتوى التعليمي', icon: BookOpen },
  { path: '/app/admin/countries', label: 'الدول', icon: Globe },
  { path: '/app/admin/exams', label: 'الاختبارات', icon: BookOpen },
  { path: '/app/admin/questions', label: 'بنك الأسئلة', icon: HelpCircle },
  { path: '/app/admin/points-packs', label: 'حزم النقاط', icon: Coins },
  { path: '/app/admin/plans', label: 'الخطط', icon: Crown },
  { path: '/app/admin/settings', label: 'الإعدادات', icon: Settings },
  { path: '/app/admin/ai-generator', label: 'توليد بالذكاء', icon: Sparkles },
  { path: '/app/admin/users', label: 'إدارة المستخدمين', icon: Users },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();

  // Real-time notifications for admins
  useAdminNotifications(true);

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-screen overflow-x-hidden" dir="rtl">
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
          'fixed inset-y-0 right-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-gold text-gold-foreground font-black text-sm">
              S
            </div>
            <div>
              <h1 className="text-sm font-bold text-sidebar-accent-foreground">لوحة الإدارة</h1>
              <p className="text-[10px] text-sidebar-muted">Saris Exams</p>
            </div>
          </div>
          <button
            className="lg:hidden rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {adminNavItems.map((item) => {
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="my-3 border-t border-sidebar-border" />

          <Link
            to="/app"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all duration-200"
          >
            <ArrowRight className="h-4 w-4 flex-shrink-0" />
            <span>العودة للمنصة</span>
          </Link>
        </nav>

        {/* User */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground font-bold text-xs">
              {user?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">
                {user?.name}
              </p>
              <p className="text-[10px] text-sidebar-muted truncate">مدير</p>
            </div>
            <button
              onClick={logout}
              className="rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              title="تسجيل الخروج"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-gold text-gold-foreground font-black text-xs">
              S
            </div>
            <span className="font-bold text-sm text-foreground">لوحة الإدارة</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <div className="p-3 sm:p-6 lg:p-8 m-2 sm:m-0">
          {children}
        </div>
      </main>
    </div>
  );
}
