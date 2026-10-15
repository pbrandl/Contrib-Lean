import { useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import logo from './assets/franzwerk-logo.webp';
import { countBids, formatEuro, formatHours, formatNumber, isPin } from './lib';

export function Logo({ className }) {
  return <img src={logo} alt="FRANZ!werk Tübingen" width="700" height="600" className={className} />;
}

// Dark blue band at the top of every page; the yellow logo needs the dark ground.
// The glow fades out before the top edge, so the band meets the blue page canvas
// seamlessly when the page is pulled down past the top.
export function Band({ children, className = '' }) {
  return (
    <header className="on-dark relative overflow-hidden bg-werkblau text-white">
      <div className="band-glow" aria-hidden="true" />
      <div className={`relative mx-auto max-w-xl px-5 ${className}`}>{children}</div>
    </header>
  );
}

export function TopBar({ label, onLogout }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <Logo className="h-14 w-auto shrink-0" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{label}</span>
        <button type="button" onClick={onLogout} className="btn min-h-[2.75rem] px-3 text-gelb hover:bg-white/10">
          Abmelden
        </button>
      </div>
    </div>
  );
}

// Total raised against the need, and the hours per month everybody offers.
export function Progress({ total, target, count, hours = 0 }) {
  const ratio = target > 0 ? total / target : 0;
  const width = Math.min(100, ratio * 100);
  const percent = Math.floor(ratio * 100);
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display font-bold tracking-tight text-gelb">
            <span className="text-5xl">{formatNumber(total)}</span>
            <span className="ml-1.5 text-3xl">€</span>
          </p>
          <p className="mt-1 text-white/75">von {formatEuro(target)} Bedarf</p>
        </div>
        <div className="text-right">
          <p className="font-display font-bold tracking-tight text-gelb/70">
            <span className="text-5xl">{formatHours(hours)}</span>
            <span className="ml-1.5 text-3xl">h</span>
          </p>
          <p className="mt-1 text-white/75">pro Monat</p>
        </div>
      </div>
      <div
        className="progress-track mt-5"
        role="progressbar"
        aria-label="Gedeckter Anteil des Bedarfs"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
      >
        <div className="progress-fill" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2.5 flex justify-between gap-4 text-sm text-white/75">
        <span>{ratio >= 1 ? `Bedarf gedeckt: ${percent} %` : `${percent} % gedeckt`}</span>
        <span>{countBids(count)}</span>
      </p>
    </div>
  );
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const error = notice.tone === 'error';
  const Icon = error ? AlertTriangle : CheckCircle2;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        key={notice.at}
        role={error ? 'alert' : 'status'}
        className={`notice-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-2.5 pl-4 pr-2 shadow-card ring-1 ${error ? 'bg-ziegel text-white ring-black/5' : 'bg-white text-tinte ring-tinte/5'}`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${error ? '' : 'text-[#2F8F5B]'}`} aria-hidden="true" />
        <p className="flex-1 text-[0.95rem] font-medium">{notice.text}</p>
        <button type="button" onClick={onClose} className={`rounded-full p-1.5 ${error ? 'hover:bg-white/10' : 'text-tinte/50 hover:bg-tinte/5'}`} aria-label="Meldung schließen">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
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
      <main className="mx-auto max-w-xl px-5 py-8">
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
      <main className="mx-auto max-w-xl space-y-4 px-5 py-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">Keine Verbindung</h1>
        <p>Der Server antwortet gerade nicht. Prüfe dein Internet und versuche es noch einmal.</p>
        <button type="button" className="btn-blau" onClick={onRetry}>Noch einmal versuchen</button>
      </main>
    </>
  );
}
