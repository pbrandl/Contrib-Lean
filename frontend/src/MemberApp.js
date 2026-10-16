import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import { api, byName, deviceId, fold, formatHours, formatNumber, isNewer, loginWithPin, memberSession, rememberTrust, round2, useNotice, usePolling } from './lib';
import { Band, Callout, LoadingPage, Logo, Notice, OfflinePage, PinChange, PinLogin, Progress, TopBar } from './ui';

// First letters of the first two words: "Jörg Müller-Lüdenscheidt" -> "JM", "Steffen" -> "S"
function initials(name) {
  const letters = name.split(/\s+/).map(w => (w.match(/\p{L}/u) || [''])[0]).filter(Boolean);
  return letters.length ? letters.slice(0, 2).join('').toLocaleUpperCase('de') : '?';
}

function readSession() {
  const session = memberSession.get();
  return session && session.role === 'member' && session.token ? session : null;
}

// Browser history: the member page gets its own entry, so the back gesture on the
// phone leaves it (= logs out) instead of doing nothing.
const isMemberEntry = () => !!(window.history.state && window.history.state.member);

export default function MemberApp() {
  const [session, setSession] = useState(readSession);
  const [notice, showNotice, clearNotice] = useNotice();

  const login = useCallback((next) => {
    memberSession.set(next);
    setSession(next);
  }, []);

  const logout = useCallback((message) => {
    memberSession.clear();
    setSession(null);
    if (isMemberEntry()) window.history.replaceState(null, '');
    if (message) showNotice('error', message);
  }, [showNotice]);

  return (
    <>
      {session
        ? <MemberPage session={session} onSession={login} onLogout={logout} showNotice={showNotice} />
        : <FrontPage onLogin={login} />}
      <Notice notice={notice} onClose={clearNotice} />
    </>
  );
}

// Front page: logo, progress, name search and the list of members.

function FrontPage({ onLogin }) {
  const [state, setState] = useState({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/public');
      setState({ status: 'ready', data });
    } catch {
      setState(prev => (prev.status === 'ready' ? prev : { status: 'offline' }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 15000, !selected);

  // The back gesture on the phone returns from the PIN step to the list.
  useEffect(() => {
    const onPop = () => setSelected(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // While searching, the search field moves to the top of the screen, so it and the
  // first results stay above the phone keyboard.
  const focusSearch = () => {
    setSearching(true);
    setTimeout(() => {
      if (document.activeElement === searchRef.current) {
        searchRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }, 250);
  };

  const choose = (member) => {
    window.history.pushState({ pinFor: member.id }, '');
    setSelected(member);
    window.scrollTo(0, 0);
  };

  const back = () => {
    if (window.history.state && window.history.state.pinFor) window.history.back();
    else setSelected(null);
  };

  const login = async (pin) => {
    const session = await loginWithPin(selected.id, pin);
    if (window.history.state && window.history.state.pinFor) window.history.replaceState(null, '');
    onLogin(session);
  };

  if (state.status === 'loading') return <LoadingPage />;
  if (state.status === 'offline') return <OfflinePage onRetry={load} />;

  const { data } = state;
  const members = [...data.members].sort(byName);
  const needle = fold(query.trim());
  const matches = needle ? members.filter(m => fold(m.name).includes(needle)) : members;

  return (
    <>
      {selected ? (
        // Small header in the PIN step, so the PIN field stays above the phone keyboard.
        <Band className="py-3">
          <Logo className="h-14 w-auto" />
        </Band>
      ) : (
        <Band className="pb-16 pt-6">
          <Logo className="h-28 w-auto sm:h-32" />
          <div className="mt-8">
            <Progress total={data.totalRaised} target={data.targetAmount} count={data.contributorCount} hours={data.totalHours} />
          </div>
        </Band>
      )}

      {/* relative: the card overlaps the header and must be drawn above it. While searching,
          the page keeps at least one screen height, so a shorter result list cannot pull
          the page back to the top. */}
      <main className={`relative mx-auto max-w-xl px-5 pb-16 ${selected ? 'pt-6' : '-mt-8'} ${searching || query ? 'min-h-[calc(100svh+8rem)]' : ''}`}>
        {selected ? (
          <div className="space-y-3">
            <button type="button" onClick={back} className="btn-leise -ml-2 px-3">
              <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Anderer Name
            </button>
            <div className="card p-5 sm:p-6">
              <PinLogin title={selected.name} intro="Gib deine PIN ein, um dein Gebot abzugeben." onSubmit={login}>
                <p className="text-sm text-tinte/60">PIN vergessen? Ein Admin kann dir eine neue setzen.</p>
              </PinLogin>
            </div>
          </div>
        ) : (
          <div className="card p-5 sm:p-6">
            <h1 className="font-display text-2xl font-bold tracking-tight">Wähle deinen Namen</h1>

            {members.length === 0 ? (
              <p className="mt-3 text-tinte/70">
                Noch niemand ist eingetragen. Die Admins tragen alle ein, die mitbieten.
              </p>
            ) : (
              <>
                <div className="relative mt-4 scroll-mt-4">
                  <label htmlFor="search" className="sr-only">Name suchen</label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-tinte/40" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    id="search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={focusSearch}
                    onBlur={() => setSearching(false)}
                    placeholder="Name suchen"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="field scroll-mt-4 rounded-full bg-papier pl-12 pr-12 shadow-none focus:bg-white"
                  />
                  {query && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-tinte/50 hover:bg-tinte/5 hover:text-tinte"
                      aria-label="Suche leeren"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {matches.length === 0 ? (
                  <p className="mt-4 px-1 text-tinte/70">Kein Name passt zu „{query.trim()}“.</p>
                ) : (
                  <ul className="-mx-2 mt-3 space-y-1">
                    {matches.map(member => (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => choose(member)}
                          className="group flex min-h-[3.25rem] w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-blau-hell"
                        >
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-werkblau font-display text-base font-semibold text-gelb"
                            aria-hidden="true"
                          >
                            {initials(member.name)}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-[1.05rem] font-medium">{member.name}</span>
                          <ChevronRight className="h-5 w-5 shrink-0 text-tinte/30 transition-transform group-hover:translate-x-0.5 group-hover:text-blau" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// Member page: own bid, hours per month, PIN change.

const STEPS = [5, 10, 25, 50];

// "6", "6,5", "6.5 h" -> number of hours, NaN if not a number.
function parseHours(input) {
  const s = String(input).replace(/h|std\.?|stunden/gi, '').replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

function MemberPage({ session, onSession, onLogout, showNotice }) {
  const { token } = session;
  const [me, setMe] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [queued, setQueued] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const queueRef = useRef(0);
  const sendingRef = useRef(false);

  // The back gesture leaves the member page and logs out. A fresh entry is pushed on
  // every start (also after a reload), so going back is always a same-page step.
  useEffect(() => {
    if (isMemberEntry()) window.history.replaceState(null, '');
    window.history.pushState({ member: true }, '');
    const onPop = () => {
      if (!isMemberEntry()) onLogout();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onLogout]);

  const apply = useCallback((next) => {
    setMe(prev => (isNewer(next, prev) ? next : prev));
  }, []);

  const load = useCallback(async () => {
    if (sendingRef.current) return;
    try {
      apply(await api('/me', { token }));
      setLoadFailed(false);
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else setLoadFailed(true);
    }
  }, [token, apply, onLogout]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 10000);

  // Clicks are collected while a request runs and sent as one step afterwards.
  // The server adds each step to the stored bid, so no click gets lost.
  const flush = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    let saved = null;
    while (queueRef.current !== 0) {
      const delta = round2(queueRef.current);
      queueRef.current = 0;
      setQueued(0);
      setInFlight(delta);
      try {
        saved = await api('/me/contribution', { method: 'POST', token, body: { delta } });
        apply(saved);
      } catch (err) {
        queueRef.current = 0;
        setQueued(0);
        setInFlight(0);
        sendingRef.current = false;
        if (err.status === 401) {
          onLogout(err.message);
        } else {
          // Without an answer the step may still have been saved: show the server's state.
          showNotice('error', err.status === 0 ? `${err.message} Dein Gebot wird neu geladen, bitte prüfe es.` : `Nicht gespeichert. ${err.message}`);
          load();
        }
        return;
      }
    }
    setInFlight(0);
    sendingRef.current = false;
    if (saved) showNotice('ok', `Gespeichert: dein Gebot ist jetzt ${formatNumber(saved.contribution)} €.`);
  }, [token, apply, load, onLogout, showNotice]);

  if (!me) return loadFailed ? <OfflinePage onRetry={load} /> : <LoadingPage />;

  const shown = Math.max(0, round2(me.contribution + inFlight + queued));
  const saving = inFlight !== 0 || queued !== 0;

  const bid = (step) => {
    setConfirmReset(false);
    queueRef.current = round2(queueRef.current + step);
    setQueued(queueRef.current);
    flush();
  };

  const reset = async () => {
    setResetting(true);
    try {
      apply(await api('/me/contribution/withdraw', { method: 'POST', token }));
      setConfirmReset(false);
      showNotice('ok', 'Gespeichert: dein Gebot ist zurückgesetzt.');
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else {
        showNotice('error', err.status === 0 ? `${err.message} Dein Gebot wird neu geladen, bitte prüfe es.` : `Nicht zurückgesetzt. ${err.message}`);
        load();
      }
    }
    setResetting(false);
  };

  const saveHours = async (hours) => {
    try {
      const data = await api('/me/hours', { method: 'PUT', token, body: { hours } });
      apply(data);
      showNotice('ok', `Gespeichert: ${formatHours(data.hours)} h pro Monat.`);
      return true;
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else showNotice('error', `Nicht gespeichert. ${err.message}`);
      return false;
    }
  };

  const changePin = async (pin) => {
    try {
      const data = await api('/me/pin', { method: 'PUT', token, body: { pin, device: deviceId() || undefined } });
      rememberTrust(data.user.id, data.trust);
      onSession(data.session);
      apply(data);
      setPinOpen(false);
      showNotice('ok', 'Gespeichert: deine neue PIN gilt ab sofort.');
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else throw err;
    }
  };

  return (
    <>
      <Band className="pb-16">
        <TopBar label={me.user.name} onLogout={() => onLogout()} />
        <div className="pt-4">
          <Progress total={me.totalRaised} target={me.targetAmount} count={me.contributorCount} hours={me.totalHours} />
        </div>
      </Band>

      <main className="relative mx-auto -mt-8 max-w-xl space-y-4 px-5 pb-24">
        {me.user.defaultPin && !pinOpen && (
          <Callout action={<button type="button" className="btn-blau min-h-[2.75rem]" onClick={() => setPinOpen(true)}>Eigene PIN wählen</button>}>
            Du nutzt noch die Start-PIN. Wähle eine eigene, damit niemand sonst in deinem Namen bieten kann.
          </Callout>
        )}

        <section aria-labelledby="bid-heading" className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 id="bid-heading" className="font-display text-2xl font-bold tracking-tight">Dein Gebot</h1>
            <button
              type="button"
              className="chip bg-papier text-tinte/70 hover:bg-[#FBEDEA] hover:text-ziegel"
              onClick={() => setConfirmReset(true)}
              disabled={shown <= 0 || saving || resetting}
              aria-expanded={confirmReset}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
            </button>
          </div>

          {confirmReset && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[#FBEDEA] px-4 py-3">
              <p className="flex-1 text-[0.95rem]">Gebot von {formatNumber(shown)} € auf 0 € setzen?</p>
              <div className="flex gap-2">
                <button type="button" className="chip bg-ziegel text-white hover:bg-[#8E2F1F]" onClick={reset} disabled={resetting}>
                  Zurücksetzen
                </button>
                <button type="button" className="chip bg-white text-tinte hover:bg-papier" onClick={() => setConfirmReset(false)} disabled={resetting}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          <p className="mt-4 font-display font-bold tracking-tight" aria-live="polite">
            <span className="text-6xl">{formatNumber(shown)}</span>
            <span className="ml-2 text-4xl text-tinte/50">€</span>
          </p>

          <div className="mt-6 grid grid-cols-4 gap-2">
            {STEPS.map(step => (
              <button
                key={step}
                type="button"
                onClick={() => bid(step)}
                disabled={resetting}
                className="bid-step"
                aria-label={`${step} Euro dazu`}
              >
                +{step}
                <span className="ml-0.5 text-sm font-semibold opacity-60">€</span>
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => bid(-1)}
              disabled={resetting || shown <= 0}
              className="bid-fine"
              aria-label="1 Euro weniger"
            >
              <Minus className="h-4 w-4" aria-hidden="true" /> 1 €
            </button>
            <button
              type="button"
              onClick={() => bid(1)}
              disabled={resetting}
              className="bid-fine"
              aria-label="1 Euro dazu"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> 1 €
            </button>
          </div>
        </section>

        <HoursCard hours={me.hours} onSave={saveHours} />

        <section aria-labelledby="pin-heading" className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pin-heading" className="font-display text-xl font-bold tracking-tight">Deine PIN</h2>
            {!pinOpen && (
              <button type="button" className="chip bg-papier text-tinte/80 hover:bg-blau-hell" onClick={() => setPinOpen(true)}>
                PIN ändern
              </button>
            )}
          </div>
          {pinOpen && (
            <div className="mt-4">
              <PinChange idPrefix="own" onSubmit={changePin} onCancel={() => setPinOpen(false)} />
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function HoursCard({ hours, onSave }) {
  const [value, setValue] = useState(hours ? formatHours(hours) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  // Follow changes from another device, unless the member is typing.
  useEffect(() => {
    if (!editing) setValue(hours ? formatHours(hours) : '');
  }, [hours, editing]);

  const parsed = value.trim() === '' ? 0 : parseHours(value);
  const unchanged = Number.isFinite(parsed) && Math.round(parsed * 2) / 2 === hours;

  const submit = async (e) => {
    e.preventDefault();
    if (!Number.isFinite(parsed) || parsed > 744) {
      setError('Gib eine Zahl zwischen 0 und 744 ein, zum Beispiel 4 oder 2,5.');
      return;
    }
    setBusy(true);
    setError('');
    if (await onSave(parsed)) setEditing(false);
    setBusy(false);
  };

  return (
    <section aria-labelledby="hours-heading" className="card p-5 sm:p-6">
      <h2 id="hours-heading" className="font-display text-xl font-bold tracking-tight">Dein Stundengebot</h2>
      <p className="mt-1.5 text-[0.95rem] text-tinte/65">
        Mit deinem Stundengebot gibst du an wie viele Stunden pro Monat du dich einbringen kannst.
      </p>
      <form onSubmit={submit} noValidate className="mt-4 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="hours" className="sr-only">Stunden pro Monat</label>
          <input
            id="hours"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); setEditing(true); setError(''); }}
            onBlur={() => { if (unchanged) setEditing(false); }}
            placeholder="0"
            className="field pr-28 text-lg font-semibold"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-tinte/50">h pro Monat</span>
        </div>
        <button type="submit" className="btn-blau" disabled={busy || unchanged}>
          Speichern
        </button>
      </form>
      {error && <p className="mt-2 text-sm font-semibold text-ziegel" role="alert">{error}</p>}
    </section>
  );
}
