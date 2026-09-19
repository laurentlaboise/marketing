import { NavLink, Outlet } from 'react-router-dom';
import { useCatalog } from '../state';
import { HelpFab } from './HelpFab';

export function Layout() {
  const { lines } = useCatalog();
  const count = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <>
      <header className="app-header">
        <div className="bar">
          <NavLink to="/" className="brand">
            WTS<span>catalog</span>
          </NavLink>
          <NavLink to="/wizard" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Wizard
          </NavLink>
          <NavLink to="/print-qrs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Print
          </NavLink>
          <NavLink to="/help" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Help
          </NavLink>
          <NavLink to="/cart" className="cart-pill">
            Cart {count}
          </NavLink>
        </div>
      </header>
      <Outlet />
      <HelpFab />
    </>
  );
}
