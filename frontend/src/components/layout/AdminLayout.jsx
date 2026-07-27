import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Building2, Package, Users, CreditCard,
  ScrollText, Activity, Menu, X, Moon, Sun, LogOut,
} from 'lucide-react';

import logoMark from '@/assets/logo-mark.png';
import { useAuth } from '@/auth/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { ErrorBoundary } from '@/components/ui/ErrorState';
import { cn } from '@/lib/cn';

/** Nav is filtered by permission, same rule as the vendor side: don't show a
 * door someone can't open. System Health has no module permission - every
 * admin role can see it - so it is never filtered out. */
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'admin_dashboard:view', end: true },
  { to: '/admin/vendors', label: 'Vendors', icon: Building2, permission: 'admin_vendors:view' },
  { to: '/admin/plans', label: 'Plans', icon: Package, permission: 'admin_plans:view' },
  { to: '/admin/users', label: 'Users', icon: Users, permission: 'admin_users:view' },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, permission: 'admin_payments:view' },
  { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText, permission: 'admin_audit:view' },
  { to: '/admin/system-health', label: 'System health', icon: Activity, permission: null },
];

export default function AdminLayout() {
  const { principal, logout, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = NAV.filter((item) => !item.permission || can(item.permission));

  const signOut = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-full min-h-screen bg-paper">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 border-r border-line bg-surface',
          'flex flex-col transition-transform lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <img src={logoMark} alt="" className="h-6 w-6" aria-hidden="true" />
            <span className="font-mono text-sm font-bold tracking-tight">Qly Admin</span>
          </div>
          <button
            className="lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-card px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-signal/10 font-medium text-signal'
                    : 'text-muted hover:bg-paper hover:text-ink',
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className="px-2 pb-2">
            <p className="truncate text-sm font-medium">{principal?.name}</p>
            <p className="truncate text-xs capitalize text-muted">{principal?.role}</p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={toggle} className="flex-1">
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Moon className="h-4 w-4" aria-hidden="true" />
              )}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} className="flex-1">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="fixed inset-0 z-30 bg-board/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="Close menu"
          tabIndex={-1}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="font-mono text-sm font-bold">Qly Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
