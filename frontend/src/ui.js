import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import logo from './assets/franzwerk-logo.webp';
import { countBids, formatHours, formatWhole, inMode, isPin } from './lib';

export function Logo({ className }) {
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

// Logo left, the name in the middle, "Abmelden" right.
export function TopBar({ label, onLogout }) {
  return (
    <div className="topbar">
      <Logo className="h-14 w-auto" />
      <span className="topbar-name">{label}</span>
      <button type="button" onClick={onLogout} className="topbar-logout">Abmelden</button>
    </div>
  );
}

// Netto/brutto: a plain grey text button that shows the current mode and switches it.
export function ModeToggle({ mode, onToggle }) {
  const other = mode === 'brutto' ? 'netto' : 'brutto';
  return (
    <button type="button" className="text-button" onClick={onToggle} aria-label={`Beträge ${mode}, auf ${other} umschalten`}>
      {mode === 'brutto' ? 'Brutto' : 'Netto'}
    </button>
  );
}

// Total raised against the need, and the hours per month everybody offers. The euros are
// shown whole, in the page's netto/brutto mode; `note` follows the Bedarf (" netto").
export function Progress({ total, target, count, hours = 0, mode = 'netto', note = '' }) {
  const ratio = target > 0 ? total / target : 0;
  const width = Math.min(100, ratio * 100);
  const percent = Math.floor(ratio * 100);
  return (
    <div>
      <div className="stats">
        <div>
          <p className="stat-big"><span>{formatWhole(inMode(total, mode))}</span><span className="unit">€</span></p>
          <p className="stat-sub">von {formatWhole(inMode(target, mode))}{'\u00a0'}€{note}</p>
        </div>
        <div className="stat-right">
          <p className="stat-big stat-dim"><span>{formatHours(hours)}</span><span className="unit">h</span></p>
          <p className="stat-sub">pro Monat</p>
        </div>
      </div>
      <div
        className="progress-track mt-[1.6rem]"
        role="progressbar"
        aria-label="Gedeckter Anteil des Bedarfs"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
      >
        <div className="progress-fill" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-[0.8rem] flex justify-between gap-4 text-sm text-white/75">
        <span>{ratio >= 1 ? `Bedarf gedeckt: ${percent} %` : `${percent} % gedeckt`}</span>
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

export function PinInput({ id, value, onChange, label, autoFocus = false, large = false }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        id={id}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        autoFocus={autoFocus}
        className={`field ${large ? 'py-3 text-center text-3xl tracking-[0.5em]' : 'tracking-[0.3em]'}`}
      />
    </div>
  );
}

// Login with a PIN. `onSubmit` returns a promise; its error message is shown below the field.
export function PinLogin({ title, intro, submitLabel = 'Anmelden', onSubmit, children }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) {
      setError('Gib deine PIN ein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit(pin);
    } catch (err) {
      setError(err.message);
      setPin('');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight">{title}</h1>
        {intro && <p className="mt-2 text-tinte/75">{intro}</p>}
      </div>
      <PinInput id="pin" label="PIN" value={pin} onChange={(v) => { setPin(v); setError(''); }} autoFocus large />
      {error && <p className="font-semibold text-ziegel" role="alert">{error}</p>}
      <button type="submit" className="btn-blau w-full text-lg" disabled={busy}>
        {busy ? 'Wird geprüft …' : submitLabel}
      </button>
      {children}
    </form>
  );
}

// Sets a new PIN; with `confirm` the PIN has to be typed twice.
export function PinChange({ idPrefix, confirm = true, onSubmit, onCancel }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!isPin(pin)) {
      setError('Die PIN muss aus 4 bis 6 Ziffern bestehen.');
      return;
    }
    if (confirm && pin !== again) {
      setError('Die beiden PINs stimmen nicht überein.');
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
      <PinInput id={`${idPrefix}-pin`} label="Neue PIN (4 bis 6 Ziffern)" value={pin} onChange={(v) => { setPin(v); setError(''); }} autoFocus />
      {confirm && (
        <PinInput id={`${idPrefix}-again`} label="Neue PIN wiederholen" value={again} onChange={(v) => { setAgain(v); setError(''); }} />
      )}
      {error && <p className="font-semibold text-ziegel" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="btn-blau flex-1" disabled={busy}>
          {busy ? 'Wird gespeichert …' : 'PIN speichern'}
        </button>
        <button type="button" className="btn-rand flex-1" onClick={onCancel} disabled={busy}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function LoadingPage() {
  return (
    <>
      <Band className="py-3">
        <Logo className="h-14 w-auto" />
      </Band>
      <main className="wrap py-8">
        <p className="text-tinte/70" role="status">Lädt …</p>
      </main>
    </>
  );
}

export function OfflinePage({ onRetry }) {
  return (
    <>
      <Band className="py-3">
        <Logo className="h-14 w-auto" />
      </Band>
      <main className="wrap space-y-4 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Keine Verbindung</h1>
        <p>Der Server antwortet gerade nicht. Prüfe dein Internet und versuche es noch einmal.</p>
        <button type="button" className="btn-blau" onClick={onRetry}>Noch einmal versuchen</button>
      </main>
    </>
  );
}
