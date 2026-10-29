import { act, fireEvent, screen } from '@testing-library/react';
import { render } from './test-utils';
import { PinLogin } from './ui';

test('PIN boxes: a box appears with each digit, the digit shows briefly and becomes a dot, at most 8', async () => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn(query => ({ matches: query === '(pointer: coarse)', media: query }));
  const onSubmit = jest.fn(() => Promise.reject(new Error('PIN falsch.')));
  const { container } = render(<PinLogin title="Anna" onSubmit={onSubmit} />);
  const boxes = () => [...container.querySelectorAll('.pin-box:not(.pin-box-ghost)')];
  expect(boxes()).toHaveLength(0);

  const key = (k) => fireEvent.click(screen.getByRole('button', { name: k }));
  key('7');
  expect(boxes()).toHaveLength(1);
  expect(boxes()[0]).toHaveTextContent('7');
  expect(boxes()[0]).toHaveClass('active');
  act(() => { jest.advanceTimersByTime(800); });
  expect(boxes()[0].querySelector('.pin-dot')).not.toBeNull();
  expect(boxes()[0]).not.toHaveTextContent('7');
  expect(screen.getByRole('button', { name: 'Anmelden' })).toBeDisabled();

  ['1', '2', '3', '4', '5', '6', '8', '9'].forEach(key);
  expect(boxes()).toHaveLength(8);
  expect(screen.getByLabelText('PIN')).toHaveValue('71234568');
  key('Letzte Ziffer löschen');
  expect(screen.getByLabelText('PIN')).toHaveValue('7123456');

  fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
  await act(async () => {});
  expect(onSubmit).toHaveBeenCalledWith('7123456');
  expect(screen.getByRole('alert')).toHaveTextContent('PIN falsch.');
  expect(boxes()).toHaveLength(0);
  jest.useRealTimers();
});

test('PIN on computers: the next free box shows a blinking cursor while the field has the focus', () => {
  window.matchMedia = jest.fn(query => ({ matches: false, media: query }));
  const { container } = render(<PinLogin title="Anna" onSubmit={jest.fn()} />);
  const field = screen.getByLabelText('PIN');
  const cursor = () => container.querySelector('.pin-box-cursor');
  expect(field).toHaveFocus();
  expect(container.querySelector('.pin-box-ghost')).toBeNull();
  expect(cursor()).toHaveClass('focused');
  expect(cursor().querySelector('.pin-caret')).not.toBeNull();

  fireEvent.change(field, { target: { value: '123' } });
  expect(container.querySelectorAll('.pin-box.filled')).toHaveLength(3);
  expect(container.querySelector('.pin-box.active')).toBeNull();
  expect(container.querySelector('.pin-boxes').lastChild).toBe(cursor());

  act(() => field.blur());
  expect(cursor()).not.toHaveClass('focused');
  fireEvent.click(container.querySelector('.pin-boxes'));
  expect(field).toHaveFocus();
  expect(cursor()).toHaveClass('focused');

  fireEvent.change(field, { target: { value: '12345678' } });
  expect(cursor()).toBeNull();
});

test('busy button: looks the same at first, ignores clicks, shows a spinner only after 0.2 s', () => {
  jest.useFakeTimers();
  const { BusyButton } = require('./ui');
  const click = jest.fn();
  const { container, rerender } = render(<BusyButton busy={false} busyLabel="Wird gespeichert" onClick={click}>Speichern</BusyButton>);
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledTimes(1);
  rerender(<BusyButton busy busyLabel="Wird gespeichert" onClick={click}>Speichern</BusyButton>);
  expect(screen.getByRole('button')).toBeEnabled();
  expect(container.querySelector('.spinner')).toBeNull();
  fireEvent.click(screen.getByRole('button'));
  expect(click).toHaveBeenCalledTimes(1);
  act(() => { jest.advanceTimersByTime(250); });
  expect(container.querySelector('.spinner')).not.toBeNull();
  expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  rerender(<BusyButton busy={false} busyLabel="Wird gespeichert" onClick={click}>Speichern</BusyButton>);
  expect(container.querySelector('.spinner')).toBeNull();
  jest.useRealTimers();
});
