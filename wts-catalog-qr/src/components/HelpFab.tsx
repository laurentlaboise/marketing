import { Link, useLocation } from 'react-router-dom';

export function HelpFab() {
  const { pathname } = useLocation();
  if (pathname === '/help') return null;
  return (
    <Link className="help-fab" to="/help">
      Help · ช่วยเหลือ
    </Link>
  );
}
