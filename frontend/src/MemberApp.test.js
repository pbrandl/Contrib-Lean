import { fireEvent, render, screen } from '@testing-library/react';
import MemberApp from './MemberApp';

const respond = (body) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });
const me = (contribution, rev) => ({
  rev, boot: 'x', totalRaised: contribution, targetAmount: 6500, contributorCount: contribution ? 1 : 0, totalHours: 0,
  user: { id: '7', name: 'Anna', defaultPin: false }, contribution, hours: 0
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('franzwerk.member', JSON.stringify({ token: 't', role: 'member', user: { id: '7', name: 'Anna' } }));
});

test('a bid step without an answer is sent again with the same id', async () => {
  let posts = 0;
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/me/contribution') {
      posts += 1;
      return posts === 1 ? Promise.reject(new TypeError('Failed to fetch')) : respond(me(5, 2));
    }
    return respond(me(0, 1));
  });
  render(<MemberApp />);
  fireEvent.click(await screen.findByRole('button', { name: '5 Euro dazu' }));
  expect(await screen.findByText(/Gespeichert: dein Gebot ist jetzt 5 €/, {}, { timeout: 4000 })).toBeInTheDocument();
  const bodies = global.fetch.mock.calls.filter(([url]) => url === '/api/me/contribution').map(([, o]) => JSON.parse(o.body));
  expect(bodies).toHaveLength(2);
  expect(bodies[0].request).toMatch(/^[A-Za-z0-9_-]{8,40}$/);
  expect(bodies[1]).toEqual(bodies[0]);
});
