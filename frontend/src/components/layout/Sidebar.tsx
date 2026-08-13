import { NavLink } from 'react-router-dom';
import { Car, Map, Video, LayoutDashboard, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { to: '/dashboard/vehicles', label: 'Vehicles', icon: <Car size={20} /> },
  { to: '/dashboard/location', label: 'Location', icon: <Map size={20} /> },
  { to: '/dashboard/video', label: 'Video', icon: <Video size={20} /> },
];

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-primary)' }}>
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5" style={{ borderColor: 'var(--border-primary)' }}>
        <div className="rounded-lg p-2 text-white" style={{ backgroundColor: 'var(--accent-600)' }}>
          <LayoutDashboard size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Fleet</h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Dashboard</p>
        </div>
        <button
          onClick={toggleTheme}
          className="ml-auto rounded-lg p-2 hover:opacity-80"
          style={{ color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:opacity-80"
            style={({ isActive }) => ({
              color: isActive ? 'var(--accent-700)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--accent-50)' : 'transparent',
            })}
          >
            <span className={item.to === '/dashboard/video' ? 'text-red-500' : ''}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4" style={{ borderColor: 'var(--border-primary)' }}>
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
      </div>
    </aside>
  );
}
