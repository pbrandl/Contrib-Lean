import AdminApp from './AdminApp';
import MemberApp from './MemberApp';

// Apache serves index.html for /admin as well (see public/.htaccess).
const base = process.env.PUBLIC_URL || '';
const isAdminPath = (path) => path.replace(/\/+$/, '') === `${base}/admin`;

export default function App() {
  return isAdminPath(window.location.pathname) ? <AdminApp /> : <MemberApp />;
}
