import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { api, byName, deviceId, fold, formatHours, formatNumber, isNewer, loginWithPin, memberSession, ownGross, rememberTrust, totalGross, useNotice, usePolling } from './lib';
import { DEMO } from './demo';
import { useAmountMode, useT } from './settings';
import { Band, LoadingPage, Logo, MaintenancePage, Notice, OfflinePage, PinChange, PinLogin, Progress, SettingsButton, TopBar } from './ui';
import AmountSheet, { usesKeypad } from './AmountSheet';

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
        ? <MemberPage session={session} onSession={login} onLogout={logout} showNotice={showNotice} clearNotice={clearNotice} />
        : <FrontPage onLogin={login} />}
      <Notice notice={notice} onClose={clearNotice} />
    </>
  );
}

// Front page: logo, progress, name search and the list of members.

function FrontPage({ onLogin }) {
  const t = useT();
  const mode = useAmountMode();
  const [state, setState] = useState({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/public');
      setState({ status: 'ready', data });
    } catch (err) {
      if (err.maintenance) setState({ status: 'maintenance' });
      else setState(prev => (prev.status === 'ready' ? prev : { status: 'offline' }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 15000, !selected);

  // The back gesture on the phone returns from the PIN step to the list.
  useEffect(() => {
    const onPop = () => {
      if (!(window.history.state && window.history.state.pinFor)) setSelected(null);
    };
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
  if (state.status === 'maintenance') return <MaintenancePage onRetry={load} />;

  const { data } = state;
  const members = [...data.members].sort(byName);
  const needle = fold(query.trim());
  const matches = needle ? members.filter(m => fold(m.name).includes(needle)) : members;

  // PIN step: a screen of its own, dark blue, with the keypad on phones.
  if (selected) {
    return (
      <PinLogin
        title={selected.name}
        intro={t('front.pinIntro')}
        onSubmit={login}
        back={<button type="button" onClick={back} className="pin-back"><ChevronLeft className="h-5 w-5" aria-hidden="true" /> {t('front.otherName')}</button>}
      >
        {t('front.pinForgotten')}
      </PinLogin>
    );
  }

  return (
    <>
      {!selected && (
        <Band className="pb-[3.9rem] pt-6">
          {/* The gear in one row with the logo, level with its top line ("Bietrunde" in the demo). */}
          <div className="flex items-start justify-between gap-3">
            <Logo className="h-28 w-auto sm:h-32" />
            <SettingsButton className={`-mr-2.5 ${DEMO ? '-mt-2.5' : ''}`} />
          </div>
          <div className="mt-5">
            <Progress total={data.totalRaised} totalGross={totalGross(data)} target={data.targetAmount} count={data.contributorCount} hours={data.totalHours} mode={mode} note={t(`progress.note.${mode}`)} />
          </div>
        </Band>
      )}

      {/* relative: the card overlaps the header and must be drawn above it. While searching,
          the page keeps at least one screen height, so a shorter result list cannot pull
          the page back to the top. */}
      <main className={`wrap relative -mt-8 pb-16 ${searching || query ? 'min-h-[calc(100svh+8rem)]' : ''}`}>
        {(
          <div className="card p-4 sm:p-6">
            <h1 className="font-display text-2xl font-bold tracking-tight">{t('front.chooseName')}</h1>

            {members.length === 0 ? (
              <p className="mt-3 text-tinte/70">
                {t('front.empty')}
              </p>
            ) : (
              <>
                <div className="relative mt-4 scroll-mt-4">
                  <label htmlFor="search" className="sr-only">{t('front.search')}</label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-tinte/40" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    id="search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={focusSearch}
                    onBlur={() => setSearching(false)}
                    placeholder={t('front.search')}
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
                      aria-label={t('common.clearSearch')}
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {matches.length === 0 ? (
                  <p className="mt-4 px-1 text-tinte/70">{t('front.noMatch', { query: query.trim() })}</p>
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

// Member page: own bid and hours, each changed on a full-screen sheet, and the PIN change.

const SAVE_RETRIES = 3;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function MemberPage({ session, onSession, onLogout, showNotice, clearNotice }) {
  const t = useT();
  const { token } = session;
  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const mode = useAmountMode();
  const [sheet, setSheet] = useState(null);
  // The sheet whose value is being saved. It can be closed before the answer comes.
  const [saving, setSaving] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const sendingRef = useRef(false);
  const moneyButton = useRef(null);
  const hoursButton = useRef(null);
  const lastSheet = useRef(null);
  const sheetRef = useRef(null);
  const pendingBack = useRef(false);
  const alive = useRef(true);

  // The open sheet, also for the history and save callbacks, which run later.
  const showSheet = useCallback((next) => {
    sheetRef.current = next;
    setSheet(next);
  }, []);

  // A save that ends after this page is gone (logged out, another member on this phone)
  // must not touch what is on screen then.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The back gesture leaves the member page and logs out. A fresh entry is pushed on
  // every start (also after a reload), so going back is always a same-page step.
  // An open sheet has an entry of its own, so the back gesture only closes it.
  useEffect(() => {
    if (isMemberEntry()) window.history.replaceState(null, '');
    window.history.pushState({ member: true }, '');
    const onPop = () => {
      if (!isMemberEntry()) {
        onLogout();
      } else if (pendingBack.current) {
        // The back step of closeSheet arrived. A sheet opened in the meantime gets its entry now.
        pendingBack.current = false;
        if (sheetRef.current) window.history.pushState({ member: true, sheet: true }, '');
      } else if (!window.history.state.sheet) {
        showSheet(null);
      } else if (!sheetRef.current) {
        // Forward onto the entry of a sheet that is closed: make it a plain page entry again.
        window.history.replaceState({ member: true }, '');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onLogout, showSheet]);

  // After the sheet closes, the focus goes back to the button that opened it.
  useEffect(() => {
    if (sheet) {
      lastSheet.current = sheet.kind;
    } else if (lastSheet.current) {
      const opener = lastSheet.current === 'money' ? moneyButton.current : hoursButton.current;
      if (opener) opener.focus({ preventScroll: true });
      lastSheet.current = null;
    }
  }, [sheet]);

  const apply = useCallback((next) => {
    setMe(prev => (isNewer(next, prev) ? next : prev));
  }, []);

  const load = useCallback(async () => {
    if (sendingRef.current) return;
    try {
      apply(await api('/me', { token }));
      setLoadError(null);
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else setLoadError(err.maintenance ? 'maintenance' : 'offline');
    }
  }, [token, apply, onLogout]);

  useEffect(() => {
    load();
  }, [load]);
  usePolling(load, 10000);

  // A banner from the last change would cover the sheet's close button.
  const openSheet = (kind) => {
    clearNotice();
    if (!pendingBack.current) {
      if (window.history.state && window.history.state.sheet) window.history.replaceState({ member: true, sheet: true }, '');
      else window.history.pushState({ member: true, sheet: true }, '');
    }
    showSheet({ kind, keypad: usesKeypad() });
  };

  // history.back() takes effect a moment later; until then a new sheet waits for its entry.
  const closeSheet = useCallback(() => {
    showSheet(null);
    if (!pendingBack.current && window.history.state && window.history.state.sheet) {
      pendingBack.current = true;
      window.history.back();
    }
  }, [showSheet]);

  // The bid and the hours are absolute values, so a request without an answer can simply
  // go out again: the server stores the same value twice and nothing is doubled.
  // `gross`: a bid typed brutto; the server keeps that amount and derives netto from it.
  const save = useCallback(async (value, gross) => {
    const started = sheet;
    if (!started || sendingRef.current) return;
    const { kind } = started;
    const path = kind === 'money' ? '/me/contribution' : '/me/hours';
    const body = kind === 'hours' ? { hours: value } : gross !== undefined ? { gross } : { amount: value };
    sendingRef.current = true;
    setSaving(started);
    let saved = null;
    let failure = null;
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          saved = await api(path, { method: 'PUT', token, body });
          break;
        } catch (err) {
          if (err.status !== 0 || attempt >= SAVE_RETRIES) throw err;
          await wait(1000 * (attempt + 1));
        }
      }
    } catch (err) {
      failure = err;
    }
    if (!alive.current) return;
    sendingRef.current = false;
    setSaving(null);
    if (saved) {
      apply(saved);
      if (sheetRef.current === started) closeSheet();
      if (kind === 'hours') showNotice('ok', t('member.savedHours', { hours: formatHours(saved.hours) }));
      else if (saved.contribution > 0) showNotice('ok', t('member.savedBid', { amount: formatNumber(mode === 'brutto' ? ownGross(saved) : saved.contribution) }));
      else showNotice('ok', t('member.withdrawn'));
    } else if (failure.status === 401) {
      onLogout(failure.message);
    } else if (failure.status === 0) {
      // Without an answer it may still have been saved: show the server's state.
      showNotice('error', `${failure.message} ${t(kind === 'money' ? 'member.reloadBid' : 'member.reloadHours')}`);
      load();
    } else {
      showNotice('error', `${t('common.notSaved')} ${failure.message}`);
    }
  }, [sheet, token, mode, apply, closeSheet, load, onLogout, showNotice, t]);

  // The back arrow does what the browser's back button does: its popstate logs out. Right
  // after closing the sheet its own back step is still on the way; then log out directly.
  const leave = () => {
    if (isMemberEntry() && !pendingBack.current) window.history.back();
    else onLogout();
  };

  // An open sheet stays, so nothing typed is lost; saving then shows the maintenance message.
  if (loadError === 'maintenance' && !sheet) return <MaintenancePage onRetry={load} />;
  if (!me) return loadError ? <OfflinePage onRetry={load} /> : <LoadingPage />;

  const changePin = async (pin) => {
    try {
      const data = await api('/me/pin', { method: 'PUT', token, body: { pin, device: deviceId() || undefined } });
      rememberTrust(data.user.id, data.trust);
      onSession(data.session);
      apply(data);
      setPinOpen(false);
      showNotice('ok', t('member.pinChanged'));
    } catch (err) {
      if (err.status === 401) onLogout(err.message);
      else throw err;
    }
  };

  return (
    <>
      {/* inert: behind the open sheet nothing can be reached with the keyboard. */}
      <div inert={sheet ? true : undefined}>
        <Band className="pb-[3.9rem]">
          <TopBar label={me.user.name} onBack={leave} />
          <Progress total={me.totalRaised} totalGross={totalGross(me)} target={me.targetAmount} count={me.contributorCount} hours={me.totalHours} mode={mode} />
        </Band>

        <main className="wrap relative -mt-8 grid gap-3 pb-8">
          <section aria-labelledby="bid-heading" className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <h1 id="bid-heading" className="font-display text-2xl font-bold tracking-tight">{t('member.title')}</h1>
              <span className="text-[0.85rem] font-medium text-tinte/55">{t(`settings.amounts.${mode}`)}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="own-value" aria-live="polite">
                <span className="sr-only">{t('member.bidLabel')} </span>
                <span data-testid="own-amount">{formatNumber(mode === 'brutto' ? ownGross(me) : me.contribution)}</span>
                <span className="unit">€</span>
              </p>
              <p className="own-value ml-auto text-right text-akzent" aria-live="polite">
                <span className="sr-only">{t('member.hoursLabel')} </span>
                <span data-testid="own-hours">{formatHours(me.hours)}</span>
                <span className="unit">h</span>
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button ref={moneyButton} type="button" className="big-btn" onClick={() => openSheet('money')}>
                {t('member.changeBid')}
              </button>
              <button ref={hoursButton} type="button" className="big-btn" onClick={() => openSheet('hours')}>
                {t('member.changeHours')}
              </button>
            </div>
          </section>

          {pinOpen ? (
            <section aria-labelledby="pin-heading" className="card p-4">
              <h2 id="pin-heading" className="font-display text-xl font-bold tracking-tight">{t('member.newPin')}</h2>
              <div className="mt-3">
                <PinChange idPrefix="own" onSubmit={changePin} onCancel={() => setPinOpen(false)} />
              </div>
            </section>
          ) : (
            <div className="flex justify-center">
              <button type="button" className="text-button" onClick={() => setPinOpen(true)}>{t('member.changePin')}</button>
            </div>
          )}
        </main>
      </div>

      {sheet && (
        <AmountSheet
          kind={sheet.kind}
          keypad={sheet.keypad}
          me={me}
          mode={mode}
          busy={saving === sheet}
          waiting={saving !== null && saving !== sheet}
          onSave={save}
          onClose={closeSheet}
        />
      )}
    </>
  );
}
