import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import { decimalSign, formatHours, formatWhole, inMode, ownGross, round2, toNet, totalGross } from './lib';
import { useT } from './settings';
import { BusyButton } from './ui';
import { KINDS, MAX_HOURS, formatRaw, fromField, fromText, isDecimalKey, pressKey, rawValue, toRaw } from './entry';

export { usesKeypad } from './lib';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const CURSOR_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
const round1 = (n) => Math.round(n * 10) / 10;

// Full-screen sheet for a new bid (kind "money") or new hours ("hours"). What the member
// types counts in the page's netto/brutto `mode`. `onSave(value, gross)` gets the netto amount
// (or the hours), and for a bid typed brutto also that brutto amount, which stays leading.
// `busy`: this sheet's value is being saved. `waiting`: an earlier save (from a sheet that was
// closed before the answer came) is still running, so this one cannot be saved yet.
export default function AmountSheet({ kind, keypad, me, mode, busy, waiting = false, onSave, onClose }) {
  const t = useT();
  const k = KINDS[kind];
  const money = kind === 'money';
  const brutto = money && mode === 'brutto';
  // The current value in what the member types: brutto, netto or hours.
  const current = money ? (brutto ? ownGross(me) : me.contribution) : me.hours;
  // It starts with the current value, so a small change needs only a few keys.
  const [initial] = useState(() => toRaw(current, kind));
  const [raw, setRaw] = useState(initial);
  const [pressed, setPressed] = useState(null);
  const [focused, setFocused] = useState(false);
  const closeRef = useRef(null);
  const inputRef = useRef(null);
  const flashTimer = useRef(null);

  const typed = rawValue(raw);
  const entered = money ? round2(typed) : round1(typed);
  const next = brutto ? toNet(entered) : entered;
  // Typed back to the start value, or the same amount written differently ("1585,00").
  const unchanged = raw === initial || entered === current;

  const latest = useRef(null);
  latest.current = { unchanged, next, gross: brutto ? entered : undefined, busy, waiting };

  const press = useCallback((key) => {
    if (latest.current.busy) return;
    setRaw(prev => pressKey(prev, key, kind));
  }, [kind]);

  const save = useCallback(() => {
    const { unchanged: same, next: amount, gross, busy: sending, waiting: blocked } = latest.current;
    if (!same && !sending && !blocked) onSave(amount, gross);
  }, [onSave]);

  const focusField = () => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  // The page behind does not scroll while the sheet is open.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    if (keypad) closeRef.current.focus();
    else focusField();
    return () => {
      root.style.overflow = before;
      clearTimeout(flashTimer.current);
    };
  }, [keypad]);

  // After a failed save the text field gets the focus back, so typing goes on.
  useEffect(() => {
    if (!keypad && !busy) focusField();
  }, [keypad, busy]);

  // Physical keys: Esc closes; digits, comma or period, Backspace and Enter work too. On the
  // keypad they always go to the sheet; on computers only while the text field has lost the
  // focus (its own handler takes them otherwise), and the focus goes back into the field.
  useEffect(() => {
    const flash = (key) => {
      setPressed(key);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPressed(null), 120);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (!keypad) {
        if (!inputRef.current || active === inputRef.current) return;
        if (active && active.tagName === 'BUTTON' && e.key === 'Enter') return; // e.g. the close button
      }
      let key = null;
      if (/^\d$/.test(e.key)) key = e.key;
      else if (isDecimalKey(e.key)) key = ',';
      else if (e.key === 'Backspace') key = 'back';
      else if (e.key === 'Enter') {
        e.preventDefault();
        save();
        return;
      }
      if (!key) return;
      e.preventDefault();
      press(key);
      if (keypad) flash(key);
      else focusField();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keypad, onClose, press, save]);

  const value = raw === '' ? '' : formatRaw(raw);

  // The cursor always stays at the end of the text field.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) input.setSelectionRange(input.value.length, input.value.length);
  }, [value]);

  // Text field: keys follow the keypad's rules, cursor keys and other characters do nothing.
  const onFieldKey = (e) => {
    if (CURSOR_KEYS.includes(e.key) || e.key === 'Delete') {
      e.preventDefault(); // also with Ctrl or Shift: the cursor stays at the end
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (isDecimalKey(e.key)) press(',');
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Enter') save();
    else if (e.key.length !== 1 && !CURSOR_KEYS.includes(e.key)) return; // Tab, Esc and the like
    e.preventDefault();
  };

  const onFieldPaste = (e) => {
    e.preventDefault();
    const text = fromText((e.clipboardData && e.clipboardData.getData('text')) || '', kind);
    if (text !== null && !busy) setRaw(text);
  };

  // Anything else that changes the field (dictation, autofill, cut): keep what is valid.
  const onFieldChange = (e) => {
    const text = fromField(e.target.value, kind);
    if (!busy && !(kind === 'hours' && rawValue(text) > MAX_HOURS)) setRaw(text);
  };

  // A click anywhere on the sheet (except on a button), also on the digits, puts the cursor
  // back into the field, at the end.
  const onSheetMouseDown = (e) => {
    if (keypad || e.target.closest('button')) return;
    e.preventDefault();
    focusField();
  };

  // Totals strip: while the member types it previews the new totals in grey.
  let total;
  let of;
  let bars = null;
  if (money) {
    const now = round2(me.totalRaised);
    const preview = unchanged ? now : round2(me.totalRaised - me.contribution + next);
    const percent = (n) => (me.targetAmount > 0 ? Math.min(100, (n / me.targetAmount) * 100) : 0);
    // In brutto mode the total counts the typed brutto amounts as they are.
    const shownTotal = brutto ? (unchanged ? totalGross(me) : totalGross(me) - ownGross(me) + entered) : preview;
    total = `${formatWhole(shownTotal)}\u00a0€`;
    of = t('progress.of', { amount: `${formatWhole(inMode(me.targetAmount, mode))}\u00a0€` });
    bars = (
      <div className="sheet-track" aria-hidden="true">
        <div className="sheet-fill" style={{ width: `${percent(Math.min(now, preview))}%` }} />
        <div className={`sheet-change${unchanged ? ' off' : ''}`} style={{ width: `${percent(Math.max(now, preview))}%` }} />
      </div>
    );
  } else {
    const preview = unchanged ? me.totalHours : me.totalHours - me.hours + next;
    total = `${formatHours(round1(preview))}\u00a0h`;
    of = t('progress.perMonth');
  }

  const text = value || '0';
  const size = text.length >= 9 ? ' len-l' : text.length >= 7 ? ' len-m' : '';

  return (
    // A click anywhere on the sheet puts the cursor back into the amount field (computers);
    // the field itself is reachable by keyboard.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div className="sheet on-dark" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onMouseDown={onSheetMouseDown}>
      <div className={`sheet-inner${keypad ? ' with-keypad' : ''}`}>
        <div className="sheet-head flex items-center gap-1">
          <button ref={closeRef} type="button" className="sheet-close" onClick={onClose} aria-label={t('sheet.close')}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          <h2 id="sheet-title" className="font-display text-[1.3rem] font-bold tracking-tight">{t(`sheet.${kind}.title`)}</h2>
        </div>

        <div className="sheet-sum">
          <p className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-center text-[0.85rem] font-medium text-white/75">
            <strong className={`sheet-total${unchanged ? '' : ' preview'}`} data-testid="sheet-total">{total}</strong>
            <span>{of}</span>
          </p>
          {bars}
        </div>

        <div className="sheet-amount">
          {keypad ? (
            <p className={`amount${size}${raw === '' ? ' empty' : ''}`} aria-live="polite" data-testid="sheet-amount">
              <span>{text}</span><span className="unit">{k.unit}</span>
            </p>
          ) : (
            <p className={`amount amount-desk${size}${focused ? ' focused' : ''}`}>
              <label className="amount-field">
                <span className="amount-mirror" aria-hidden="true">{text}</span>
                <input
                  ref={inputRef}
                  size={1}
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0"
                  aria-label={t(`sheet.${kind}.label`)}
                  value={value}
                  onChange={onFieldChange}
                  onKeyDown={onFieldKey}
                  onPaste={onFieldPaste}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
              </label>
              <span className="caret" aria-hidden="true" />
              <span className="unit">{k.unit}</span>
            </p>
          )}
        </div>

        {keypad && (
          <div className="keypad">
            {KEYS.map(key => (
              <button
                key={key}
                type="button"
                className={`key${pressed === key ? ' pressed' : ''}`}
                onClick={() => press(key)}
                disabled={key === ',' && raw.includes(',')}
                aria-label={key === 'back' ? t('keypad.back') : key === ',' ? t('keypad.decimal') : undefined}
              >
                {key === 'back' ? <ArrowLeft className="h-7 w-7" aria-hidden="true" /> : key === ',' ? decimalSign() : key}
              </button>
            ))}
          </div>
        )}

        <div className="sheet-foot flex items-center">
          <BusyButton type="button" className="save" onClick={save} busy={busy} busyLabel={t('busy.saving')} disabled={unchanged || waiting}>
            {t('common.save')}
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </BusyButton>
        </div>
      </div>
    </div>
  );
}
