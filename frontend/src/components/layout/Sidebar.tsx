import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  Car,
  LayoutDashboard,
  LogOut,
  Map,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Video,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const navItems: NavItem[] = [
  { to: '/dashboard/vehicles', label: 'Vehicles', icon: <Car size={19} /> },
  { to: '/dashboard/location', label: 'Location', icon: <Map size={19} /> },
  { to: '/dashboard/video', label: 'Video', icon: <Video size={19} /> },
];

export default function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r transition-[width] duration-200 ${collapsed ? 'w-20' : 'w-64'}`}
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <div className={`flex items-center gap-3 border-b py-5 ${collapsed ? 'flex-col px-3' : 'px-5'}`} style={{ borderColor: 'var(--border-primary)' }}>
        <div className="app-icon-box">
          <LayoutDashboard size={19} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Fleet</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Dashboard</p>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className={`${collapsed ? '' : 'ml-auto'} app-button app-button-muted h-9 w-9 p-0`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className={`flex-1 space-y-1 py-5 ${collapsed ? 'px-3' : 'px-4'}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`flex items-center rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center px-3 py-3' : 'gap-3 px-3 py-3'}`}
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent-700)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--accent-50)' : 'transparent',
            })}
            title={item.label}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              {item.icon}
            </span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className={`space-y-2 border-t p-4 ${collapsed ? 'px-3' : ''}`} style={{ borderColor: 'var(--border-primary)' }}>
        <button
          onClick={toggleTheme}
          className={`app-button app-button-muted w-full ${collapsed ? 'px-0' : 'justify-start'}`}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>

        <button
          onClick={logout}
          className={`app-button app-button-danger w-full ${collapsed ? 'px-0' : 'justify-start'}`}
          aria-label="Logout"
          title="Logout"
          type="button"
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}