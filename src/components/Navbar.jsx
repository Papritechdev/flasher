import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname }     = useLocation();

  return (
    <nav className="bg-slate-900 border-b border-slate-700 px-6 py-3 flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-red-700 text-lg font-bold tracking-tight">⬡ Papritech Flasher</span>
          <span className="text-slate-600 text-xs">Station</span>
        </div>

        {/* Nav links */}
        <div className="flex gap-1">
          <Link
            to="/dashboard"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              pathname === '/dashboard'
                ? 'bg-blue-800 text-blue-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/history"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              pathname === '/history'
                ? 'bg-blue-800 text-blue-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            History
          </Link>
          <Link
            to="/flash"
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              pathname === '/flash'
                ? 'bg-blue-800 text-blue-200'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Flash Device
          </Link>
        </div>
      </div>

      {/* User */}
      <div className="flex items-center gap-4">
        <span className="text-xs text-slate-500 hidden sm:block">{user?.email}</span>
        <button
          className="text-xs text-slate-400 hover:text-red-400 transition-colors"
          onClick={logout}
        >
          Logout
        </button>
      </div>
    </nav>
  );
}
