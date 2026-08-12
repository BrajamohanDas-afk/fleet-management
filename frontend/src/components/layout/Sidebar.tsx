import { NavLink } from 'react-router-dom';
import { Car, Map, Video, LayoutDashboard } from 'lucide-react';

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
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <div className="rounded-lg bg-primary-600 p-2 text-white">
          <LayoutDashboard size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Fleet</h1>
          <p className="text-xs text-slate-500">Dashboard</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <span className={item.to === '/dashboard/video' ? 'text-red-500' : ''}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-700">Live Feed</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
            </span>
            <span className="text-xs text-slate-500">Connected</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
