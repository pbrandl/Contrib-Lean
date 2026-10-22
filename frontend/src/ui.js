import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Lock, SearchX, Settings, Wrench } from 'lucide-react';
import logo from './assets/franzwerk-logo.webp';
import { DEMO } from './demo';
import { countBids, formatHours, formatWhole, inMode, isPin, toGross, useDelayed, usesKeypad } from './lib';
import { useSettings, useT } from './settings';

export function Logo({ className }) {
  const t = useT();
  // The demo carries no organisation's logo.
  if (DEMO) {
    return (
      <span className={`demo-wordmark ${className || ''}`} role="img" aria-label="Demo">
        {t('app.name')}<span>Demo</span>
      </span>
    );
  }
  return <img src={logo} alt="FRANZ!werk Tübingen" width="700" height="600" className={className} />;
}

// Dark blue band at the top of every page; the yellow logo needs the dark ground.
// The glow fades out before the top edge, so the band meets the page canvas seamlessly.
export function Band({ children, className = '' }) {
  return (
    <header className="on-dark relative overflow-hidden bg-werkblau text-white">
      <div className="band-glow" aria-hidden="true" />
      <div className={`wrap relative ${className}`}>{children}</div>
    </header>
  );
}

// The gear that opens the settings page; on every page, on the dark blue.
export function SettingsButton({ className = '' }) {
  const { openSettings, t } = useSettings();
  return (
    <button type="button" className={`settings-button ${className}`} onClick={openSettings} aria-label={t('settings.open')}>
      <Settings className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}

// Logo left, the name in the middle, settings and "Abmelden" right.
export function TopBar({ label, onLogout }) {
  const t = useT();
  return (
    <div className="topbar">
      <Logo className="h-14 w-auto" />
      <span className="topbar-name">{label}</span>
      <span className="topbar-end">
        <SettingsButton />
        <button type="button" onClick={onLogout} className="topbar-logout">{t('common.logout')}</button>
      </span>
    </div>
  );
}

// Total raised against the need, and the hours per month everybody offers. The euros are
// shown whole, in the page's netto/brutto mode; `note` follows the Bedarf (" netto").
// `totalGross`: the brutto total from the server, with bids typed brutto as typed.
export function Progress({ total, totalGross, target, count, hours = 0, mode = 'netto', note = '' }) {
  const t = useT();
  const ratio = target > 0 ? total / target : 0;
  const width = Math.min(100, ratio * 100);
  const percent = Math.floor(ratio * 100);
  return (
    <div>
      <div className="stats">
        <div>
          <p className="stat-big"><span>{formatWhole(mode === 'brutto' ? (totalGross !== undefined ? totalGross : toGross(total)) : total)}</span><span className="unit">€</span></p>
          <p className="stat-sub">{t('progress.of', { amount: `${formatWhole(inMode(target, mode))}\u00a0€` })}{note}</p>
        </div>
        <div className="stat-right">
          <p className="stat-big stat-dim"><span>{formatHours(hours)}</span><span className="unit">h</span></p>
          <p className="stat-sub">{t('progress.perMonth')}</p>
        </div>
      </div>
      <div
        className="progress-track mt-[1.6rem]"
        role="progressbar"
        aria-label={t('progress.covered')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
      >
        <div className="progress-fill" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-[0.8rem] flex justify-between gap-4 text-sm text-white/75">
        <span>{ratio >= 1 ? t('progress.full', { percent }) : t('progress.percent', { percent })}</span>
        <span>{countBids(count)}</span>
      </p>
    </div>
  );
}

// Banner at the top: dark green with a check mark for saved changes, ziegel for errors.
// A tap closes it; confirmations also disappear on their own (useNotice). Both live regions
// stay in the page, so screen readers announce the text that appears in them.
export function Notice({ notice, onClose }) {
  const banner = (error) => {
    if (!notice || (notice.tone === 'error') !== error) return null;
    const Icon = error ? AlertTriangle : CheckCircle2;
    return (
      <button type="button" key={notice.at} onClick={onClose} className={`notice notice-in ${error ? 'bg-ziegel' : 'bg-gruen'}`}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="flex-1">{notice.text}</span>
      </button>
    );
  };
  return (
    <>
      <div className="notice-wrap" role="status">{banner(false)}</div>
      <div className="notice-wrap" role="alert">{banner(true)}</div>
    </>
  );
}

export function Callout({ children, action }) {
  return (
    <div className="rounded-2xl bg-gelb-hell px-4 py-3.5 ring-1 ring-inset ring-gelb/60">
      <p className="text-[0.95rem]">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PinInput({ id, value, onChange, label, autoFocus = false }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        autoFocus={autoFocus}
        className="field tracking-[0.3em]"
      />
    </div>
  );
}

// Login with a PIN on a dark blue screen. Every digit gets its own box: it shows briefly,
// then turns into a dot, and the next empty box appears (the length is not known, so the
// boxes start left and grow to the right, up to PIN_MAX). Touch devices get the page's own
// keypad; on computers a hidden field takes the keys. `onSubmit` returns a promise; its
// error message is shown below the boxes. `back`: a link or button above the title.
export const PIN_MAX = 8;
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
const REVEAL_MS = 700;

export function PinLogin({ title, intro, submitLabel, onSubmit, back, children }) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [reveal, setReveal] = useState(-1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [keypad] = useState(usesKeypad);
  const inputRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!keypad && inputRef.current) inputRef.current.focus();
  }, [keypad]);

  const change = (text) => {
    if (busy) return;
    const next = text.replace(/\D/g, '').slice(0, PIN_MAX);
    clearTimeout(timer.current);
    if (next.length > pin.length) {
      setReveal(next.length - 1);
      timer.current = setTimeout(() => setReveal(-1), REVEAL_MS);
    } else {
      setReveal(-1);
    }
    setPin(next);
    setError('');
  };

  const press = (key) => change(key === 'back' ? pin.slice(0, -1) : pin + key);

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (busy) return;
    if (pin.length < 4) {
      setError(pin ? t('pin.tooShort') : t('pin.empty'));
      return;
    }
    setBusy(true);
    setError('');
    clearTimeout(timer.current);
    setReveal(-1);
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(err.message);
      setPin('');
      setReveal(-1);
      setBusy(false);
      if (!keypad && inputRef.current) inputRef.current.focus();
    }
  };

  const boxes = Math.min(pin.length + 1, PIN_MAX);
  return (
    <form className="pin-screen on-dark" onSubmit={submit} noValidate>
      <div className="pin-inner">
        <div className="pin-top">
          {back}
          <SettingsButton className="ml-auto" />
        </div>
        <div className="pin-head">
          <span className="pin-lock" aria-hidden="true"><Lock className="h-6 w-6" /></span>
          <h1>{title}</h1>
          {intro && <p>{intro}</p>}
        </div>

        <label htmlFor="pin" className="sr-only">{t('pin.label')}</label>
        <input
          ref={inputRef}
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_MAX}
          value={pin}
          readOnly={busy}
          onChange={(e) => change(e.target.value)}
          className="sr-only"
        />
        <div className="pin-boxes" aria-hidden="true" onClick={() => { if (!keypad && inputRef.current) inputRef.current.focus(); }}>
          {Array.from({ length: boxes }, (_, i) => {
            const filled = i < pin.length;
            const active = i === pin.length;
            return (
              <span key={active ? `active-${i}` : i} className={`pin-box${filled ? ' filled' : ''}${active ? ' active' : ''}`}>
                {filled && (i === reveal ? pin[i] : <span className="pin-dot" />)}
              </span>
            );
          })}
        </div>
        <p className="pin-error" role="alert">{error}</p>

        {keypad && (
          <div className="keypad pin-keypad">
            {PIN_KEYS.map(key => (key === '' ? <span key="gap" /> : (
              <button
                key={key}
                type="button"
                className="key"
                onClick={() => press(key)}
                aria-label={key === 'back' ? t('keypad.back') : undefined}
              >
                {key === 'back' ? <ArrowLeft className="h-7 w-7" aria-hidden="true" /> : key}
              </button>
            )))}
          </div>
        )}

        <BusyButton type="submit" className="pin-submit" busy={busy} busyLabel={t('busy.checking')} disabled={pin.length < 4}>
          {submitLabel || t('pin.submit')}
        </BusyButton>
        {children && <div className="pin-foot">{children}</div>}
      </div>
    </form>
  );
}

// Sets a new PIN; with `confirm` the PIN has to be typed twice.
export function PinChange({ idPrefix, confirm = true, onSubmit, onCancel }) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPin(pin)) {
      setError(t('pin.format'));
      return;
    }
    if (confirm && pin !== again) {
      setError(t('pin.mismatch'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <PinInput id={`${idPrefix}-pin`} label={t('pin.new')} value={pin} onChange={(v) => { setPin(v); setError(''); }} autoFocus />
      {confirm && (
        <PinInput id={`${idPrefix}-again`} label={t('pin.repeat')} value={again} onChange={(v) => { setAgain(v); setError(''); }} />
      )}
      {error && <p className="font-semibold text-ziegel" role="alert">{error}</p>}
      <div className="flex gap-2">
        <BusyButton type="submit" className="btn-blau flex-1" busy={busy} busyLabel={t('busy.saving')}>
          {t('pin.save')}
        </BusyButton>
        <button type="button" className="btn-rand flex-1" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

// A button for an action that waits for the server. While `busy` it looks the same and
// ignores clicks; only when the wait takes longer than 0.2 s a spinner takes the place of
// its content (which keeps the button's width). `disabled` is for "not possible yet".
export function BusyButton({ busy = false, busyLabel, disabled = false, className = '', onClick, children, ...rest }) {
  const slow = useDelayed(busy);
  const click = (e) => {
    if (busy) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
  };
  return (
    <button {...rest} className={`busy-button ${className}`} disabled={!busy && disabled} aria-busy={busy || undefined} onClick={click}>
      <span className={`busy-content${slow ? ' invisible' : ''}`}>{children}</span>
      {slow && <span className="busy-spinner" aria-hidden="true"><Spinner /></span>}
      {busy && <span className="sr-only">{busyLabel}</span>}
    </button>
  );
}

// A turning ring in the current text colour.
export function Spinner({ className = '' }) {
  return <span className={`spinner ${className}`} aria-hidden="true" />;
}

// While the page starts: only the blue top, and a spinner if it takes longer than 0.2 s.
export function LoadingPage() {
  const t = useT();
  const slow = useDelayed(true);
  return (
    <div className="loading-page on-dark" role="status" aria-label={t('common.loading')}>
      {slow && <Spinner className="h-8 w-8 text-white" />}
    </div>
  );
}

// Full blue screen like the PIN entry, for the moments the app itself cannot be used.
function StatusScreen({ icon, title, children }) {
  return (
    <main className="status-screen on-dark">
      <SettingsButton className="status-settings" />
      <div className="status-inner">
        <Logo className="status-logo" />
        <span className="pin-lock" aria-hidden="true">{icon}</span>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

const MAINTENANCE_RETRY_MS = 5000;

// The server does not answer (an update, a restart): the page asks again every few seconds
// and goes back to the app on its own as soon as the server is there again.
export function MaintenancePage({ onRetry }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const retry = useRef(onRetry);
  const alive = useRef(true);
  useEffect(() => {
    retry.current = onRetry;
  }, [onRetry]);

  const check = async () => {
    setBusy(true);
    try {
      await retry.current();
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    const id = setInterval(() => { retry.current(); }, MAINTENANCE_RETRY_MS);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, []);

  return (
    <StatusScreen icon={<Wrench className="h-6 w-6" />} title={t('maintenance.title')}>
      <p>{t('maintenance.text')}</p>
      <p className="status-hint" role="status">{t('maintenance.hint')}</p>
      <BusyButton type="button" className="pin-submit status-action" busy={busy} busyLabel={t('busy.checking')} onClick={check}>
        {t('maintenance.check')}
      </BusyButton>
    </StatusScreen>
  );
}

export function NotFoundPage({ home = '/' }) {
  const t = useT();
  return (
    <StatusScreen icon={<SearchX className="h-6 w-6" />} title={t('notFound.title')}>
      <p>{t('notFound.text')}</p>
      <a href={home} className="pin-submit status-action">{t('notFound.home')}</a>
    </StatusScreen>
  );
}

export function OfflinePage({ onRetry }) {
  const t = useT();
  return (
    <>
      <Band className="flex items-center justify-between py-3">
        <Logo className="h-14 w-auto" />
        <SettingsButton />
      </Band>
      <main className="wrap space-y-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('offline.title')}</h1>
        <p>{t('offline.text')}</p>
        <button type="button" className="btn-blau" onClick={onRetry}>{t('offline.retry')}</button>
      </main>
    </>
  );
}
