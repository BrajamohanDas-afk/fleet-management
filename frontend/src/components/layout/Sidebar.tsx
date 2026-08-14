import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  Car,
  Map,
  Video,
  LayoutDashboard,
  Sun,
  Moon,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
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
  { to: '/dashboard/vehicles', label: 'Vehicles', icon: <Car size={20} /> },
  { to: '/dashboard/location', label: 'Location', icon: <Map size={20} /> },
  { to: '/dashboard/video', label: 'Video', icon: <Video size={20} /> },
];

export default function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-slate-200 transition-[width] duration-200 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
      style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}
    >
      <div className={`flex items-center gap-3 border-b border-slate-200 py-5 ${collapsed ? 'flex-col px-3' : 'px-6'}`} style={{ borderColor: 'var(--border-primary)' }}>
        <div className="rounded-lg p-2 text-white" style={{ backgroundColor: 'var(--accent-600)' }}>
          <LayoutDashboard size={20} />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Fleet</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Dashboard</p>
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          className={`${collapsed ? 'ml-0' : 'ml-auto'} rounded-lg p-2 hover:opacity-80`}
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className={`border-b border-slate-200 py-3 ${collapsed ? 'px-3' : 'px-4'}`} style={{ borderColor: 'var(--border-primary)' }}>
        <button
          onClick={toggleTheme}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:opacity-80 ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          type="button"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {!collapsed && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
        </button>
      </div>

      <nav className={`flex-1 space-y-1 py-6 ${collapsed ? 'px-3' : 'px-4'}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={`flex items-center gap-3 rounded-lg py-3 text-sm font-medium transition-colors hover:opacity-80 ${
              collapsed ? 'justify-center px-3' : 'px-4'
            }`}
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent-700)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--accent-50)' : 'transparent',
            })}
            title={item.label}
          >
            <span className={item.to === '/dashboard/video' ? 'text-red-500' : ''}>{item.icon}</span>
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      <div className={`space-y-3 border-t border-slate-200 p-4 ${collapsed ? 'px-3' : ''}`} style={{ borderColor: 'var(--border-primary)' }}>
        {!collapsed && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Live Feed</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Connected</span>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors hover:opacity-80 ${
            collapsed ? 'justify-center' : ''
          }`}
          style={{ color: 'var(--danger-600)', backgroundColor: 'var(--danger-50)' }}
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
