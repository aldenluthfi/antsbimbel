import { NavLink } from 'react-router-dom';
import { currentTutor } from '../../data/mockData';

export default function Navbar() {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 rounded-lg font-medium transition-colors ${
      isActive
        ? 'bg-amber-500 text-white'
        : 'text-gray-600 hover:bg-amber-100 hover:text-amber-700'
    }`;

  return (
    <nav className="bg-white shadow-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="text-2xl">🐜</div>
            <span className="text-xl font-bold text-amber-600">ANTS Bimbel</span>
          </div>

          <div className="flex items-center gap-2">
            <NavLink to="/" className={navLinkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/schedule" className={navLinkClass}>
              Schedule
            </NavLink>
            <NavLink to="/log" className={navLinkClass}>
              Tutoring Log
            </NavLink>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold">
              {currentTutor.name.charAt(0)}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-900">{currentTutor.name}</p>
              <p className="text-xs text-gray-500">Tutor</p>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
