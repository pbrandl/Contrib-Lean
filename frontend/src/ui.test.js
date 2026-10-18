import { act, fireEvent, render, screen } from '@testing-library/react';
import { PinLogin } from './ui';

test('PIN boxes: one empty box to start, a digit shows briefly and becomes a dot, at most 8', async () => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn(query => ({ matches: query === '(pointer: coarse)', media: query }));
  const onSubmit = jest.fn(() => Promise.reject(new Error('PIN falsch.')));
  const { container } = render(<PinLogin title="Anna" onSubmit={onSubmit} />);
  const boxes = () => [...container.querySelectorAll('.pin-box')];
  expect(boxes()).toHaveLength(1);
  expect(boxes()[0]).toHaveClass('active');

  const key = (k) => fireEvent.click(screen.getByRole('button', { name: k }));
  key('7');
  expect(boxes()).toHaveLength(2);
  expect(boxes()[0]).toHaveTextContent('7');
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
  expect(boxes()).toHaveLength(1);
  jest.useRealTimers();
});
