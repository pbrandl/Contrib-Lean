import { useEffect, useState } from 'react';
import AdminApp from './AdminApp';
import MemberApp from './MemberApp';
import { DEMO, DEMO_ADMIN_PIN, DEMO_PIN, resetDemo } from './demo';
import { SettingsProvider, useSettings } from './settings';
import SettingsPage from './SettingsPage';
import { NotFoundPage } from './ui';

// Apache serves index.html for /admin as well, and for every unknown address with
// status 404 (see public/.htaccess).
const base = process.env.PUBLIC_URL || '';
const pageOf = (path) => {
  const page = path.replace(/\/+$/, '');
  if (page === base || page === `${base}/index.html`) return 'member';
  if (page === `${base}/admin`) return 'admin';
  return 'unknown';
};

export default function App() {
  return (
    <SettingsProvider>
      <Shell />
    </SettingsProvider>
  );
}

// The settings page lies over the current page, which keeps its state below it.
function Shell() {
  const { open } = useSettings();
  return (
    <>
      <div inert={open ? true : undefined}>
        {DEMO ? <DemoApp /> : <Page />}
      </div>
      {open && <SettingsPage />}
    </>
  );
}

function Page() {
  const page = pageOf(window.location.pathname);
  if (page === 'admin') return <AdminApp />;
  if (page === 'unknown') return <NotFoundPage home={`${base}/`} />;
  return <MemberApp />;
}

// The demo is one page without a server: #admin switches to the admin view.
const demoView = () => (window.location.hash === '#admin' ? 'admin' : 'member');

function DemoApp() {
  const { t } = useSettings();
  const [view, setView] = useState(demoView);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onHash = () => setView(demoView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const show = (next) => {
    window.location.hash = next === 'admin' ? 'admin' : 'start';
    setView(next);
    window.scrollTo(0, 0);
  };

  const reset = () => {
    resetDemo();
    setRound(r => r + 1);
    show('member');
  };

  return (
    <>
      <div className="demo-bar">
        <p>
          <strong>{t('demo.title')}</strong>{' '}
          {view === 'admin' ? <>{t('demo.adminPin')} <b>{DEMO_ADMIN_PIN}</b></> : <>{t('demo.memberPin')} <b>{DEMO_PIN}</b></>}
        </p>
        <div className="demo-actions">
          <button type="button" onClick={() => show(view === 'admin' ? 'member' : 'admin')}>
            {view === 'admin' ? t('demo.toMembers') : t('demo.toAdmin')}
          </button>
          <button type="button" onClick={reset}>{t('demo.reset')}</button>
        </div>
      </div>
      {view === 'admin' ? <AdminApp key={`a${round}`} /> : <MemberApp key={`m${round}`} />}
    </>
  );
}
