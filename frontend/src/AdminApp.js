import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, Pencil, Search, Upload, X } from 'lucide-react';
import { adminSession, api, byName, deviceId, download, fold, formatEuro, isNewer, isPin, loginWithPin, parseAmount, rememberTrust, today, totalGross, useNotice, usePolling } from './lib';
import { EXPORT_FORMATS, IMPORT_ACCEPT, readImportFile } from './files';
import { useAmountMode, useT } from './settings';
import { Band, BusyButton, Callout, LoadingPage, MaintenancePage, Notice, OfflinePage, PinChange, PinInput, PinLogin, Progress, TopBar } from './ui';

function readSession() {
  const session = adminSession.get();
  return session && session.role === 'admin' && session.token ? session : null;
}

export default function AdminApp() {
  const [session, setSession] = useState(readSession);
  const current = useRef(session);
  const [notice, showNotice, clearNotice] = useNotice();

  const login = useCallback((next) => {
    adminSession.set(next);
    current.current = next;
    setSession(next);
  }, []);

  // A request that was sent with an older token (before a PIN change) must not log out.
  const logout = useCallback((message, usedToken) => {
    if (usedToken && current.current && current.current.token !== usedToken) return;
    adminSession.clear();
    current.current = null;
    setSession(null);
    if (message) showNotice('error', message);
  }, [showNotice]);

  return (
    <>
      {session
        ? <AdminPage session={session} onSession={login} onLogout={logout} showNotice={showNotice} />
        : <AdminLogin onLogin={login} />}
      <Notice notice={notice} onClose={clearNotice} />
    </>
  );
}

function AdminLogin({ onLogin }) {
  const t = useT();
  const login = async (pin) => {
    onLogin(await loginWithPin('admin', pin));
  };

  return (
    <PinLogin
      title={t('admin.title')}
      intro={t('admin.loginIntro')}
      onSubmit={login}
      back={<a href="/" className="pin-back"><ChevronLeft className="h-5 w-5" aria-hidden="true" /> {t('admin.toStart')}</a>}
    />
  );
}

function AdminPage({ session, onSession, onLogout, showNotice }) {
  const t = useT();
  const { token } = session;
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [mode] = useAmountMode();

  const apply = useCallback((next) => {
    setData(prev => (isNewer(next, prev) ? next : prev));
  }, []);

  // Admin request: applies the returned state; 401 logs out, other errors go to the caller.
  const call = useCallback(async (path, options = {}) => {
    try {
      const result = await api(path, { ...options, token });
      if (result && typeof result.rev === 'number') apply(result);
      return result;
    } catch (err) {
      if (err.status === 401) onLogout(err.message, token);
      throw err;
    }
  }, [token, apply, onLogout]);

  const load = useCallback(async () => {
    try {
      await call('/admin/data');
      setLoadError(null);
    } catch (err) {
      if (err.status !== 401) setLoadError(err.maintenance ? 'maintenance' : 'offline');
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 15000);

  if (!data && loadError === 'maintenance') return <MaintenancePage onRetry={load} />;
  if (!data) return loadError ? <OfflinePage onRetry={load} /> : <LoadingPage />;

  const changeAdminPin = async (pin) => {
    const result = await call('/admin/users/admin/pin', { method: 'PUT', body: { pin, device: deviceId() || undefined } });
    rememberTrust('admin', result.trust);
    onSession(result.session);
    setAdminPinOpen(false);
    showNotice('ok', t('admin.pin.saved'));
  };

  return (
    <>
      <Band className="pb-8">
        <TopBar label={t('admin.title')} onLogout={() => onLogout()} />
        <Progress total={data.totalRaised} totalGross={totalGross(data)} target={data.targetAmount} count={data.contributorCount} hours={data.totalHours} mode={mode} />
      </Band>

      <main className="wrap space-y-7 pb-24 pt-6">
        {data.admin.defaultPin && !adminPinOpen && (
          <Callout action={<button type="button" className="btn-blau" onClick={() => setAdminPinOpen(true)}>{t('admin.pin.change')}</button>}>
            {t('admin.pin.defaultWarning')}
          </Callout>
        )}

        <MembersSection users={data.users} call={call} showNotice={showNotice} />
        <TargetSection target={data.targetAmount} call={call} showNotice={showNotice} />
        <DataSection memberCount={data.users.length} call={call} showNotice={showNotice} />

        <section aria-labelledby="admin-pin-heading" className="border-t border-tinte/10 pt-6">
          <h2 id="admin-pin-heading" className="font-display text-2xl font-bold tracking-tight">{t('admin.pin.title')}</h2>
          {adminPinOpen ? (
            <div className="mt-4">
              <PinChange idPrefix="admin" onSubmit={changeAdminPin} onCancel={() => setAdminPinOpen(false)} />
            </div>
          ) : (
            <button type="button" className="btn-rand mt-4" onClick={() => setAdminPinOpen(true)}>{t('admin.pin.change')}</button>
          )}
        </section>
      </main>
    </>
  );
}

function MembersSection({ users, call, showNotice }) {
  const t = useT();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [created, setCreated] = useState([]);
  // With many members the list is folded away, so the other sections are close by.
  const [expanded, setExpanded] = useState(users.length === 0);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setAddError(t('admin.members.nameMissing'));
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const result = await call('/admin/users', { method: 'POST', body: { name: name.trim() } });
      setName('');
      // Start PINs are shown only once: keep all of this visit until "Fertig".
      setCreated(prev => [{ id: result.added.id, name: result.added.name, pin: result.added.startPin }, ...prev]);
    } catch (err) {
      if (err.status === 0) {
        setAddError(`${err.message} ${t('admin.members.checkList', { name: name.trim() })}`);
      } else if (err.status !== 401) {
        setAddError(err.message);
      }
    }
    setAdding(false);
  };

  const sorted = [...users].sort(byName);
  const needle = fold(query.trim());
  const matches = needle ? sorted.filter(u => fold(u.name).includes(needle)) : sorted;
  const withStartPin = users.filter(u => u.defaultPin).length;

  return (
    <section aria-labelledby="members-heading">
      <button type="button" className="collapse-head" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} aria-controls="members-panel">
        <span className="min-w-0 flex-1">
          <span id="members-heading" className="block font-display text-2xl font-bold leading-tight tracking-tight">{t('admin.members.title')}</span>
          <span className="block text-[0.9rem] text-tinte/70">
            {t('count.members', { count: users.length })}
            {withStartPin > 0 && t('admin.members.withStartPin', { count: withStartPin })}
          </span>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div id="members-panel">
        {expanded && (
          <form onSubmit={add} noValidate className="mt-4">
            <label htmlFor="new-member" className="mb-1 block font-semibold">{t('admin.members.add')}</label>
            <div className="flex gap-2">
              <input
                id="new-member"
                value={name}
                onChange={(e) => { setName(e.target.value); setAddError(''); }}
                placeholder={t('admin.members.namePlaceholder')}
                autoComplete="off"
                maxLength={60}
                className="field min-w-0 flex-1"
              />
              <BusyButton type="submit" className="btn-blau" busy={adding} busyLabel={t('busy.adding')}>{t('admin.members.addButton')}</BusyButton>
            </div>
            {addError ? (
              <p className="mt-1 font-semibold text-ziegel" role="alert">{addError}</p>
            ) : (
              <p className="mt-1 text-tinte/70">{t('admin.members.addHint')}</p>
            )}
          </form>
        )}

        {created.length > 0 && (
          <div className="mt-4 space-y-3 rounded border-2 border-blau/30 bg-blau-hell p-4" role="status">
            <ul className="space-y-2">
              {created.map(entry => (
                <li key={entry.id}>
                  <p className="break-words">{t('admin.members.added', { name: entry.name })}</p>
                  <p className="font-display text-4xl font-bold tracking-[0.3em]" data-testid="start-pin">{entry.pin}</p>
                </li>
              ))}
            </ul>
            <p className="text-tinte/75">{t('admin.members.startPinHint', { count: created.length })}</p>
            <button type="button" className="btn-rand" onClick={() => setCreated([])}>{t('common.done')}</button>
          </div>
        )}

        {expanded && users.length > 0 && (
          <div className="relative mt-6">
            <label htmlFor="member-search" className="sr-only">{t('admin.members.search')}</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tinte/50" aria-hidden="true" />
            <input
              id="member-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.members.search')}
              autoComplete="off"
              className="field pl-10 pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-tinte/60 hover:text-tinte"
                aria-label={t('common.clearSearch')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {expanded && users.length > 0 && matches.length === 0 && (
          <p className="mt-4 text-tinte/75">{t('admin.members.noMatch', { query: query.trim() })}</p>
        )}

        {expanded && matches.length > 0 && (
          <ul className="mt-3 divide-y divide-tinte/10 border-y border-tinte/10">
            {matches.map(user => {
              const editing = open === user.id;
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    className="member-row"
                    onClick={() => setOpen(editing ? null : user.id)}
                    aria-expanded={editing}
                    aria-controls={`edit-${user.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-lg font-semibold">{user.name}</span>
                      {user.defaultPin && <span className="block text-tinte/70">{t('admin.members.startPin')}</span>}
                    </span>
                    <Pencil className="h-5 w-5 shrink-0 text-tinte/45" aria-hidden="true" />
                    <span className="sr-only">{t('admin.edit.open')}</span>
                  </button>
                  {editing && (
                    <MemberEditor key={user.id} user={user} call={call} showNotice={showNotice} onClose={() => setOpen(null)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// Name and PIN of one member, and deleting. An empty PIN field keeps the PIN.
function MemberEditor({ user, call, showNotice, onClose }) {
  const t = useT();
  const [name, setName] = useState(user.name);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const id = `edit-${user.id}`;

  const save = async (e) => {
    e.preventDefault();
    const body = {};
    if (!name.trim()) {
      setError(t('admin.members.nameMissing'));
      return;
    }
    if (name.trim() !== user.name) body.name = name.trim();
    if (pin) {
      if (!isPin(pin)) {
        setError(t('pin.format'));
        return;
      }
      body.pin = pin;
    }
    if (!body.name && !body.pin) {
      onClose();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await call(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body });
      onClose();
      showNotice('ok', t(body.pin ? (body.name ? 'admin.edit.savedBoth' : 'admin.edit.savedPin') : 'admin.edit.savedName', { name: body.name || user.name }));
    } catch (err) {
      setBusy(false);
      if (err.status !== 401) setError(err.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await call(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      onClose();
      showNotice('ok', t('admin.edit.deleted', { name: user.name }));
    } catch (err) {
      setDeleting(false);
      if (err.status !== 401) showNotice('error', `${t('admin.edit.notDeleted')} ${err.message}`);
    }
  };

  if (confirmDelete) {
    return (
      <div id={id} className="mb-3 space-y-3 rounded border-2 border-ziegel/30 p-4">
        <p>{t('admin.edit.deleteQuestion', { name: user.name })}</p>
        <div className="flex gap-2">
          <BusyButton type="button" className="btn-ziegel flex-1" onClick={remove} busy={deleting} busyLabel={t('busy.deleting')}>
            {t('admin.edit.delete')}
          </BusyButton>
          <button type="button" className="btn-rand flex-1" onClick={() => setConfirmDelete(false)} disabled={deleting}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form id={id} onSubmit={save} noValidate className="mb-4 space-y-3">
      <div>
        <label htmlFor={`${id}-name`} className="mb-1.5 block text-sm font-semibold">{t('admin.edit.name')}</label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          autoComplete="off"
          maxLength={60}
          className="field"
          autoFocus
        />
      </div>
      <PinInput id={`${id}-pin`} label={t('admin.edit.pin')} value={pin} onChange={(v) => { setPin(v); setError(''); }} />
      {error && <p className="font-semibold text-ziegel" role="alert">{error}</p>}
      <div className="flex gap-2">
        <BusyButton type="submit" className="btn-blau flex-1" busy={busy} busyLabel={t('busy.saving')}>{t('common.save')}</BusyButton>
        <button type="button" className="btn-rand flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
      </div>
      <button type="button" className="text-button text-ziegel" onClick={() => setConfirmDelete(true)} disabled={busy}>
        {t('admin.edit.deleteMember')}
      </button>
    </form>
  );
}

function TargetSection({ target, call, showNotice }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const amount = parseAmount(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('admin.target.invalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await call('/admin/target', { method: 'PUT', body: { targetAmount: amount } });
      setValue('');
      showNotice('ok', t('admin.target.saved', { amount: formatEuro(amount) }));
    } catch (err) {
      if (err.status !== 401) setError(err.message);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="target-heading" className="border-t border-tinte/10 pt-6">
      <h2 id="target-heading" className="font-display text-2xl font-bold tracking-tight">{t('admin.target.title')}</h2>
      <p className="mt-1 text-tinte/75">{t('admin.target.current', { amount: formatEuro(target) })}</p>
      <form onSubmit={save} noValidate className="mt-4">
        <label htmlFor="target" className="mb-1 block font-semibold">{t('admin.target.label')}</label>
        <div className="flex gap-2">
          <input
            id="target"
            inputMode="decimal"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            placeholder={String(target)}
            autoComplete="off"
            className="field min-w-0 flex-1"
          />
          <BusyButton type="submit" className="btn-blau" busy={busy} busyLabel={t('busy.saving')}>{t('common.save')}</BusyButton>
        </div>
        {error && <p className="mt-1 font-semibold text-ziegel" role="alert">{error}</p>}
      </form>
    </section>
  );
}

const formatStore = {
  get() {
    try {
      return window.localStorage.getItem('franzwerk.exportFormat');
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      window.localStorage.setItem('franzwerk.exportFormat', value);
    } catch {
      // storage disabled: the choice lasts until reload
    }
  }
};

function DataSection({ memberCount, call, showNotice }) {
  const t = useT();
  const [format, setFormat] = useState(() => (EXPORT_FORMATS.some(f => f.id === formatStore.get()) ? formatStore.get() : EXPORT_FORMATS[0].id));
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const chooseFormat = (id) => {
    setFormat(id);
    formatStore.set(id);
  };

  const exportNow = async () => {
    setExporting(true);
    try {
      const data = await call('/admin/export', { timeout: 60 * 1000 });
      const chosen = EXPORT_FORMATS.find(f => f.id === format);
      const file = await chosen.build(data);
      download(`bietrunde-${today()}.${chosen.id}`, file.type, file.content);
    } catch (err) {
      if (err.status !== 401) showNotice('error', `${t('admin.data.exportFailed')} ${err.message}`);
    }
    setExporting(false);
  };

  const chooseFile = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      setPending({ fileName: file.name, ...(await readImportFile(file)) });
    } catch (err) {
      setPending(null);
      setError(`${file.name}: ${err.message}`);
    }
  };

  const runImport = async () => {
    setBusy(true);
    try {
      // An import with PINs takes a while on the server (one scrypt per PIN).
      const result = await call('/admin/import', { method: 'POST', body: pending.body, timeout: 5 * 60 * 1000 });
      setPending(null);
      showNotice('ok', t('admin.data.imported', { members: t('count.members', { count: result.imported }) }));
    } catch (err) {
      if (err.status !== 401) setError(`${t('admin.data.notImported')} ${err.message}`);
    }
    setBusy(false);
  };

  const fileButton = 'btn-rand cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blau';

  return (
    <section aria-labelledby="data-heading" className="border-t border-tinte/10 pt-6">
      <h2 id="data-heading" className="font-display text-2xl font-bold tracking-tight">{t('admin.data.title')}</h2>

      <h3 className="mt-4 font-semibold">{t('admin.data.export')}</h3>
      <div className="split-button mt-2">
        <BusyButton type="button" className="split-main" onClick={exportNow} busy={exporting} busyLabel={t('busy.exporting')}>
          <Download className="h-5 w-5" aria-hidden="true" /> {t('admin.data.download')}
        </BusyButton>
        <label htmlFor="export-format" className="sr-only">{t('admin.data.format')}</label>
        <span className="split-pick">
          <select id="export-format" value={format} onChange={(e) => chooseFormat(e.target.value)}>
            {EXPORT_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-tinte/70">{t('admin.data.exportHint')}</p>

      <h3 className="mt-6 font-semibold">{t('admin.data.import')}</h3>
      <label className={`${fileButton} mt-2 w-full`}>
        <input type="file" accept={IMPORT_ACCEPT} className="sr-only" onChange={chooseFile} />
        <Upload className="h-5 w-5" aria-hidden="true" /> {t('admin.data.chooseFile')}
      </label>
      <p className="mt-1.5 text-sm text-tinte/60">{t('admin.data.importTypes')}</p>
      <p className="mt-2 text-tinte/70">{t('admin.data.importHint')}</p>

      {error && <p className="mt-3 font-semibold text-ziegel" role="alert">{error}</p>}

      {pending && (
        <div className="mt-4 space-y-3 rounded border-2 border-ziegel/30 p-4">
          <p className="break-words font-semibold">{pending.fileName}</p>
          <p>
            {t('admin.data.summary', { members: t('count.members', { count: pending.count }), total: formatEuro(pending.total) })}
            {pending.target ? t('admin.data.summaryTarget', { target: formatEuro(pending.target) }) : ''}.
          </p>
          <p>{t('admin.data.replaceWarning', { members: t('count.members', { count: memberCount }) })}</p>
          <div className="flex gap-2">
            <BusyButton type="button" className="btn-ziegel flex-1" onClick={runImport} busy={busy} busyLabel={t('busy.importing')}>
              {t('admin.data.importButton')}
            </BusyButton>
            <button type="button" className="btn-rand flex-1" onClick={() => setPending(null)} disabled={busy}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
