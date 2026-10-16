import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Download, Search, Trash2, Upload, X } from 'lucide-react';
import { adminSession, api, byName, deviceId, download, fold, formatEuro, isNewer, loginWithPin, parseAmount, rememberTrust, round2, today, useAmountMode, useNotice, usePolling } from './lib';
import { membersFromCsv, membersToCsv } from './csv';
import { Band, Callout, LoadingPage, Logo, ModeToggle, Notice, OfflinePage, PinChange, PinLogin, Progress, TopBar } from './ui';

const countMembers = (n) => (n === 1 ? '1 Mitglied' : `${n} Mitglieder`);

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
  const login = async (pin) => {
    onLogin(await loginWithPin('admin', pin));
  };

  return (
    <>
      <Band className="pb-6 pt-5">
        <Logo className="h-28 w-auto" />
      </Band>
      <main className="wrap pb-16 pt-6">
        <PinLogin title="Admin" intro="Melde dich mit der Admin-PIN an." onSubmit={login}>
          <a href="/" className="btn-leise -ml-2 px-2">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Zur Startseite
          </a>
        </PinLogin>
      </main>
    </>
  );
}

function AdminPage({ session, onSession, onLogout, showNotice }) {
  const { token } = session;
  const [data, setData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [adminPinOpen, setAdminPinOpen] = useState(false);
  const [mode, toggleMode] = useAmountMode('franzwerk.adminMode');

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
      setLoadFailed(false);
    } catch (err) {
      if (err.status !== 401) setLoadFailed(true);
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 15000);

  if (!data) return loadFailed ? <OfflinePage onRetry={load} /> : <LoadingPage />;

  const changeAdminPin = async (pin) => {
    const result = await call('/admin/users/admin/pin', { method: 'PUT', body: { pin, device: deviceId() || undefined } });
    rememberTrust('admin', result.trust);
    onSession(result.session);
    setAdminPinOpen(false);
    showNotice('ok', 'Die neue Admin-PIN ist gespeichert.');
  };

  return (
    <>
      <Band className="pb-8">
        <TopBar label="Admin" onLogout={() => onLogout()} />
        <Progress total={data.totalRaised} target={data.targetAmount} count={data.contributorCount} hours={data.totalHours} mode={mode} />
      </Band>

      <main className="wrap space-y-7 pb-24 pt-6">
        {data.admin.defaultPin && !adminPinOpen && (
          <Callout action={<button type="button" className="btn-blau" onClick={() => setAdminPinOpen(true)}>Admin-PIN ändern</button>}>
            Die Admin-PIN ist noch 0000. Ändere sie, damit niemand sonst Mitglieder, PINs und Gebote verwalten kann.
          </Callout>
        )}

        <MembersSection users={data.users} call={call} showNotice={showNotice} />
        <TargetSection target={data.targetAmount} call={call} showNotice={showNotice} />
        <DataSection memberCount={data.users.length} call={call} showNotice={showNotice} />

        <section aria-labelledby="settings-heading" className="border-t border-tinte/10 pt-6">
          <h2 id="settings-heading" className="font-display text-2xl font-bold tracking-tight">Einstellungen</h2>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3">
            <span className="font-semibold">Beträge anzeigen</span>
            <ModeToggle mode={mode} onToggle={toggleMode} />
          </div>
          <p className="text-[0.9rem] text-tinte/70">Gilt nur für deine Ansicht. Gespeichert wird immer netto.</p>
          {adminPinOpen ? (
            <div className="mt-4">
              <h3 className="mb-2 font-semibold">Neue Admin-PIN</h3>
              <PinChange idPrefix="admin" onSubmit={changeAdminPin} onCancel={() => setAdminPinOpen(false)} />
            </div>
          ) : (
            <button type="button" className="btn-rand mt-4" onClick={() => setAdminPinOpen(true)}>Admin-PIN ändern</button>
          )}
        </section>
      </main>
    </>
  );
}

function MembersSection({ users, call, showNotice }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [created, setCreated] = useState([]);
  // With many members the list is folded away, so the other sections are close by.
  const [expanded, setExpanded] = useState(users.length === 0);

  const add = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setAddError('Gib einen Namen ein.');
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
        setAddError(`${err.message} Prüfe in der Liste, ob ${name.trim()} schon eingetragen ist. Wenn ja, vergib mit „PIN setzen“ eine PIN.`);
      } else if (err.status !== 401) {
        setAddError(err.message);
      }
    }
    setAdding(false);
  };

  const setPin = async (user, pin) => {
    await call(`/admin/users/${encodeURIComponent(user.id)}/pin`, { method: 'PUT', body: { pin } });
    setOpen(null);
    showNotice('ok', `Die neue PIN für ${user.name} ist gespeichert.`);
  };

  const remove = async (user) => {
    setDeleting(true);
    try {
      await call(`/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
      setOpen(null);
      showNotice('ok', `${user.name} ist gelöscht.`);
    } catch (err) {
      if (err.status !== 401) showNotice('error', `Nicht gelöscht. ${err.message}`);
    }
    setDeleting(false);
  };

  const toggle = (id, mode) => setOpen(prev => (prev && prev.id === id && prev.mode === mode ? null : { id, mode }));

  const sorted = [...users].sort(byName);
  const needle = fold(query.trim());
  const matches = needle ? sorted.filter(u => fold(u.name).includes(needle)) : sorted;
  const withStartPin = users.filter(u => u.defaultPin).length;

  return (
    <section aria-labelledby="members-heading">
      <button type="button" className="collapse-head" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} aria-controls="members-panel">
        <span className="min-w-0 flex-1">
          <span id="members-heading" className="block font-display text-2xl font-bold leading-tight tracking-tight">Mitglieder</span>
          <span className="block text-[0.9rem] text-tinte/70">
            {countMembers(users.length)}
            {withStartPin > 0 && `, ${withStartPin} davon mit Start-PIN`}
          </span>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div id="members-panel">
        {expanded && (
          <form onSubmit={add} noValidate className="mt-4">
            <label htmlFor="new-member" className="mb-1 block font-semibold">Mitglied eintragen</label>
            <div className="flex gap-2">
              <input
                id="new-member"
                value={name}
                onChange={(e) => { setName(e.target.value); setAddError(''); }}
                placeholder="Name"
                autoComplete="off"
                maxLength={60}
                className="field min-w-0 flex-1"
              />
              <button type="submit" className="btn-blau" disabled={adding}>Eintragen</button>
            </div>
            {addError ? (
              <p className="mt-1 font-semibold text-ziegel" role="alert">{addError}</p>
            ) : (
              <p className="mt-1 text-tinte/70">Neue Mitglieder bekommen eine zufällige Start-PIN. Sie wird nach dem Eintragen angezeigt.</p>
            )}
          </form>
        )}

        {created.length > 0 && (
          <div className="mt-4 space-y-3 rounded border-2 border-blau/30 bg-blau-hell p-4" role="status">
            <ul className="space-y-2">
              {created.map(entry => (
                <li key={entry.id}>
                  <p className="break-words">{entry.name} ist eingetragen. Start-PIN:</p>
                  <p className="font-display text-4xl font-bold tracking-[0.3em]" data-testid="start-pin">{entry.pin}</p>
                </li>
              ))}
            </ul>
            <p className="text-tinte/75">
              Gib die {created.length === 1 ? 'PIN' : 'PINs'} direkt weiter. Sie {created.length === 1 ? 'wird' : 'werden'} nur jetzt angezeigt. Später kannst du mit „PIN setzen“ eine neue vergeben.
            </p>
            <button type="button" className="btn-rand" onClick={() => setCreated([])}>Fertig</button>
          </div>
        )}

        {expanded && users.length > 0 && (
          <div className="relative mt-6">
            <label htmlFor="member-search" className="sr-only">Mitglied suchen</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-tinte/50" aria-hidden="true" />
            <input
              id="member-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mitglied suchen"
              autoComplete="off"
              className="field pl-10 pr-11"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-2 text-tinte/60 hover:text-tinte"
                aria-label="Suche leeren"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {expanded && users.length > 0 && matches.length === 0 && (
          <p className="mt-4 text-tinte/75">Kein Mitglied passt zu „{query.trim()}“.</p>
        )}

        {expanded && matches.length > 0 && (
          <ul className="mt-3 divide-y divide-tinte/10 border-y border-tinte/10">
            {matches.map(user => {
              const mode = open && open.id === user.id ? open.mode : null;
              return (
                <li key={user.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-semibold">{user.name}</p>
                      {user.defaultPin && <p className="text-tinte/70">Start-PIN</p>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-rand min-h-[2.75rem] px-3"
                        onClick={() => toggle(user.id, 'pin')}
                        aria-expanded={mode === 'pin'}
                      >
                        PIN setzen
                      </button>
                      <button
                        type="button"
                        className="btn-rand min-h-[2.75rem] px-3 text-ziegel"
                        onClick={() => toggle(user.id, 'delete')}
                        aria-expanded={mode === 'delete'}
                        aria-label={`${user.name} löschen`}
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {mode === 'pin' && (
                    <div className="mt-3">
                      <PinChange idPrefix={`pin-${user.id}`} confirm={false} onSubmit={(pin) => setPin(user, pin)} onCancel={() => setOpen(null)} />
                    </div>
                  )}

                  {mode === 'delete' && (
                    <div className="mt-3 space-y-3 rounded border-2 border-ziegel/30 p-4">
                      <p>
                        {user.name} löschen? Das Gebot wird ebenfalls gelöscht. Das lässt sich hier nicht rückgängig machen.
                      </p>
                      <div className="flex gap-2">
                        <button type="button" className="btn-ziegel flex-1" onClick={() => remove(user)} disabled={deleting}>
                          {deleting ? 'Wird gelöscht …' : 'Löschen'}
                        </button>
                        <button type="button" className="btn-rand flex-1" onClick={() => setOpen(null)} disabled={deleting}>
                          Abbrechen
                        </button>
                      </div>
                    </div>
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

function TargetSection({ target, call, showNotice }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const amount = parseAmount(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Gib einen Betrag größer als 0 ein, zum Beispiel 6500.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await call('/admin/target', { method: 'PUT', body: { targetAmount: amount } });
      setValue('');
      showNotice('ok', `Der Bedarf ist jetzt ${formatEuro(amount)} netto.`);
    } catch (err) {
      if (err.status !== 401) setError(err.message);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="target-heading" className="border-t border-tinte/10 pt-6">
      <h2 id="target-heading" className="font-display text-2xl font-bold tracking-tight">Bedarf</h2>
      <p className="mt-1 text-tinte/75">Aktuell {formatEuro(target)} netto</p>
      <form onSubmit={save} noValidate className="mt-4">
        <label htmlFor="target" className="mb-1 block font-semibold">Neuer Bedarf in Euro (netto)</label>
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
          <button type="submit" className="btn-blau" disabled={busy}>Speichern</button>
        </div>
        {error && <p className="mt-1 font-semibold text-ziegel" role="alert">{error}</p>}
      </form>
    </section>
  );
}

function fromCsv(text) {
  const users = membersFromCsv(text);
  return {
    body: { users },
    count: users.length,
    total: round2(users.reduce((sum, u) => sum + u.contribution, 0)),
    target: null
  };
}

function fromJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige JSON-Datei.');
  }
  if (!json || !Array.isArray(json.users)) throw new Error('Die Datei enthält keine Mitgliederliste.');
  const users = json.users.filter(u => u && u.id !== 'admin');
  const contributions = json.contributions && typeof json.contributions === 'object' ? json.contributions : {};
  const hours = json.hours && typeof json.hours === 'object' ? json.hours : {};
  const target = Number(json.targetAmount) > 0 ? Number(json.targetAmount) : null;
  return {
    body: { users, contributions, hours, targetAmount: target || undefined },
    count: users.length,
    total: round2(users.reduce((sum, u) => sum + (Number(contributions[u.id]) || 0), 0)),
    target
  };
}

function DataSection({ memberCount, call, showNotice }) {
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const readFile = (parse) => async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      setPending({ fileName: file.name, ...parse(await file.text()) });
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
      showNotice('ok', `${countMembers(result.imported)} importiert.`);
    } catch (err) {
      if (err.status !== 401) setError(`Nicht importiert. ${err.message}`);
    }
    setBusy(false);
  };

  const exportAs = async (kind) => {
    try {
      const data = await call('/admin/export', { timeout: 60 * 1000 });
      if (kind === 'csv') {
        download(`bietrunde-${today()}.csv`, 'text/csv;charset=utf-8', membersToCsv(data.users, data.contributions, data.hours));
      } else {
        download(`bietrunde-${today()}.json`, 'application/json', JSON.stringify(data, null, 2));
      }
    } catch (err) {
      if (err.status !== 401) showNotice('error', `Export fehlgeschlagen. ${err.message}`);
    }
  };

  const fileButton = 'btn-rand cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blau';

  return (
    <section aria-labelledby="data-heading" className="border-t border-tinte/10 pt-6">
      <h2 id="data-heading" className="font-display text-2xl font-bold tracking-tight">Daten</h2>

      <h3 className="mt-4 font-semibold">Sichern</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" className="btn-rand" onClick={() => exportAs('csv')}>
          <Download className="h-5 w-5" aria-hidden="true" /> CSV-Export
        </button>
        <button type="button" className="btn-rand" onClick={() => exportAs('json')}>
          <Download className="h-5 w-5" aria-hidden="true" /> JSON-Export
        </button>
      </div>
      <p className="mt-2 text-tinte/70">Exporte enthalten Namen, Stunden und jedes Gebot netto und brutto, aber keine PINs.</p>

      <h3 className="mt-6 font-semibold">Importieren</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={fileButton}>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={readFile(fromCsv)} />
          <Upload className="h-5 w-5" aria-hidden="true" /> CSV-Import
        </label>
        <label className={fileButton}>
          <input type="file" accept=".json,application/json" className="sr-only" onChange={readFile(fromJson)} />
          <Upload className="h-5 w-5" aria-hidden="true" /> JSON-Import
        </label>
      </div>
      <p className="mt-2 text-tinte/70">
        CSV-Format: username,pin,contribution,hours, Gebote netto. Ein Import ersetzt alle Mitglieder, Gebote und Stunden.
      </p>

      {error && <p className="mt-3 font-semibold text-ziegel" role="alert">{error}</p>}

      {pending && (
        <div className="mt-4 space-y-3 rounded border-2 border-ziegel/30 p-4">
          <p className="break-words font-semibold">{pending.fileName}</p>
          <p>
            {countMembers(pending.count)}, Gebote zusammen {formatEuro(pending.total)} netto
            {pending.target ? `, Bedarf ${formatEuro(pending.target)} netto` : ''}.
          </p>
          <p>
            Der Import ersetzt alle {countMembers(memberCount)}, Gebote und Stunden. Wer schon eingetragen ist,
            behält die bisherige PIN, wenn die Datei keine PIN enthält. Neue Mitglieder ohne PIN in der Datei bekommen die Start-PIN 1234.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-ziegel flex-1" onClick={runImport} disabled={busy}>
              {busy ? 'Wird importiert …' : 'Importieren'}
            </button>
            <button type="button" className="btn-rand flex-1" onClick={() => setPending(null)} disabled={busy}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
