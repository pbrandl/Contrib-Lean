// Demo mode (`vite build --mode demo`): the whole backend runs in the browser with example data,
// so the app can be shown without a server. Every visitor gets the same start data; what
// they change stays in their own browser (localStorage) until "reset demo".
// It mirrors the routes and responses of backend/server.js that the frontend uses.

export const DEMO = import.meta.env.MODE === 'demo';
export const DEMO_PIN = '1234';
export const DEMO_ADMIN_PIN = '0000';

const STORE_KEY = 'bietrunde-demo.data';

// A page shown inside another page may not be allowed to add history entries; the demo
// then simply works without them instead of stopping.
if (DEMO && typeof window !== 'undefined' && window.history) {
  for (const name of ['pushState', 'replaceState']) {
    const original = window.history[name].bind(window.history);
    window.history[name] = (...args) => {
      try {
        original(...args);
      } catch {
        // ignored, see above
      }
    };
  }
}
const VAT_PERCENT = 19;
const round2 = (n) => Math.round(n * 100) / 100;
const toGross = (net) => Math.round((Math.round(net * 100) * (100 + VAT_PERCENT)) / 100) / 100;
const toNet = (gross) => Math.ceil((Math.round(gross * 100) * 100) / (100 + VAT_PERCENT)) / 100;

// [name, bid netto, hours per month]
const EXAMPLE = [
  ['Anna Becker', 1585, 11.5],
  ['Ben Hoffmann', 1200, 4],
  ['Carla Neumann', 950, 8],
  ['Deniz Aydın', 1400, 0],
  ['Emil Fischer', 820.5, 6],
  ['Fatma Yılmaz', 1100, 12],
  ['Greta Lange', 0, 0],
  ['Hannah Weber', 1350, 10],
  ['Ida Wagner', 760, 3.5],
  ['Jonas Krüger', 0, 0],
  ['Jörg Müller-Lüdenscheidt', 1250, 5],
  ['Katharina Wolf', 1480, 16],
  ['Lena Schneider', 990, 2],
  ['Luis Hartmann', 0, 0],
  ['Mara Schulz', 1150, 7.5],
  ['Maximilian von Hohenberg-Schwarzenfels', 1800, 0],
  ['Nils Berger', 0, 0],
  ['Ole Hansen', 640, 20],
  ['Paul', 0, 0],
  ['Rosa Zimmermann', 1020, 6],
  ['Sophie Braun', 0, 0],
  ['Steffen', 1310, 24],
  ['Tim Vogel', 0, 0],
  ['Zoë Kraus', 875, 4]
];

function freshData() {
  const data = { rev: 1, users: [], contributions: {}, grossBids: {}, hours: {}, targetAmount: 24000 };
  EXAMPLE.forEach(([name, net, hours], i) => {
    const id = `demo${String(i + 1).padStart(2, '0')}`;
    data.users.push({ id, name, pin: DEMO_PIN, defaultPin: false });
    if (net > 0) data.contributions[id] = net;
    if (hours > 0) data.hours[id] = hours;
  });
  return data;
}

let memory = null;

function load() {
  if (memory) return memory;
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY));
    if (saved && Array.isArray(saved.users)) memory = saved;
  } catch {
    // storage blocked: the demo runs from memory
  }
  if (!memory) memory = freshData();
  return memory;
}

function save(data) {
  data.rev += 1;
  memory = data;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // see load()
  }
}

// Back to the example data, for the next presentation.
export function resetDemo() {
  memory = freshData();
  try {
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem('franzwerk.member');
    window.sessionStorage.removeItem('franzwerk.admin');
  } catch {
    // see load()
  }
}

// `code` and `params` as the server sends them, so lib.js translates the message.
class DemoError extends Error {
  constructor(status, message, code, params) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

const grossOf = (data, id) => {
  const net = data.contributions[id] || 0;
  if (!(net > 0)) return 0;
  return data.grossBids[id] > 0 ? data.grossBids[id] : toGross(net);
};

function summary(data) {
  const ids = Object.keys(data.contributions).filter(id => data.contributions[id] > 0);
  const hours = Object.values(data.hours).filter(h => h > 0);
  return {
    rev: data.rev,
    boot: 'demo',
    totalRaised: round2(ids.reduce((sum, id) => sum + data.contributions[id], 0)),
    totalRaisedGross: round2(ids.reduce((sum, id) => sum + grossOf(data, id), 0)),
    targetAmount: data.targetAmount,
    contributorCount: ids.length,
    totalHours: hours.reduce((sum, h) => sum + h, 0)
  };
}

const memberView = (data, user) => ({
  ...summary(data),
  user: { id: user.id, name: user.name, defaultPin: !!user.defaultPin },
  contribution: data.contributions[user.id] || 0,
  contributionGross: grossOf(data, user.id),
  hours: data.hours[user.id] || 0
});

const adminView = (data) => ({
  ...summary(data),
  admin: { defaultPin: false },
  users: data.users.map(u => ({ id: u.id, name: u.name, defaultPin: !!u.defaultPin }))
});

const session = (user) => ({ token: `demo:${user.id}`, role: user.id === 'admin' ? 'admin' : 'member', user: { id: user.id, name: user.name } });

// `field`: bid, amount, target or hours, as the server's error codes.
function amount(value, field, max = 1000000) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) {
    throw field === 'hours'
      ? new DemoError(400, 'Die Stunden liegen nicht zwischen 0 und 744.', 'hours_range', { max })
      : new DemoError(400, 'Ungültiger Betrag.', 'amount_range', { field, max });
  }
  return round2(n);
}

function pinOf(value) {
  if (typeof value !== 'string' || !/^\d{4,8}$/.test(value)) throw new DemoError(400, 'Die PIN muss aus 4 bis 8 Ziffern bestehen.', 'pin_format');
  return value;
}

function nameOf(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60) throw new DemoError(400, 'Ungültiger Name.', 'name_format', { max: 60 });
  return name;
}

const sameName = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

function handle(method, path, body, token) {
  const data = load();
  const who = typeof token === 'string' && token.startsWith('demo:') ? token.slice(5) : null;
  const me = () => {
    const user = data.users.find(u => u.id === who);
    if (!user || who === 'admin') throw new DemoError(401, 'Bitte melde dich neu an.', 'session_expired');
    return user;
  };
  const admin = () => {
    if (who !== 'admin') throw new DemoError(401, 'Bitte melde dich neu an.', 'session_expired');
  };
  const route = `${method} ${path}`;
  let m;

  if (route === 'GET /public') {
    return { ...summary(data), members: data.users.map(u => ({ id: u.id, name: u.name })) };
  }
  if (route === 'POST /login') {
    const { userId, pin } = body || {};
    if (userId === 'admin') {
      if (pin !== DEMO_ADMIN_PIN) throw new DemoError(401, 'PIN falsch.', 'demo_wrong_pin', { pin: DEMO_ADMIN_PIN });
      return session({ id: 'admin', name: 'Admin' });
    }
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new DemoError(404, 'Diesen Namen gibt es nicht mehr.', 'name_gone');
    if (pin !== user.pin) throw new DemoError(401, 'PIN falsch.', 'demo_wrong_pin_member', { pin: DEMO_PIN });
    return session(user);
  }
  if (route === 'GET /me') return memberView(data, me());
  if (route === 'PUT /me/contribution') {
    const user = me();
    const gross = body && body.gross !== undefined ? amount(body.gross, 'bid') : 0;
    const net = body && body.gross !== undefined ? toNet(gross) : amount(body && body.amount, 'bid');
    if (net > 0) data.contributions[user.id] = net;
    else delete data.contributions[user.id];
    if (net > 0 && gross > 0) data.grossBids[user.id] = gross;
    else delete data.grossBids[user.id];
    save(data);
    return memberView(data, user);
  }
  if (route === 'PUT /me/hours') {
    const user = me();
    const hours = Math.round(amount(body && body.hours, 'hours', 744) * 10) / 10;
    if (hours > 0) data.hours[user.id] = hours;
    else delete data.hours[user.id];
    save(data);
    return memberView(data, user);
  }
  if (route === 'PUT /me/pin') {
    const user = me();
    user.pin = pinOf(body && body.pin);
    save(data);
    return { ...memberView(data, user), session: session(user) };
  }

  if (route === 'GET /admin/data') {
    admin();
    return adminView(data);
  }
  if (route === 'POST /admin/users') {
    admin();
    const name = nameOf(body && body.name);
    if (data.users.some(u => sameName(u.name, name))) throw new DemoError(409, 'Schon eingetragen.', 'name_taken', { name });
    const startPin = String(1000 + Math.floor(Math.random() * 9000)).replace(/^(1234)$/, '4821');
    const user = { id: `demo${Date.now().toString(36)}`, name, pin: startPin, defaultPin: true };
    data.users.push(user);
    save(data);
    return { ...adminView(data), added: { id: user.id, name, defaultPin: true, startPin } };
  }
  if ((m = route.match(/^PUT \/admin\/users\/([^/]+)\/pin$/))) {
    admin();
    const id = decodeURIComponent(m[1]);
    const pin = pinOf(body && body.pin);
    if (id === 'admin') return { ...adminView(data), session: session({ id: 'admin', name: 'Admin' }) };
    const user = data.users.find(u => u.id === id);
    if (!user) throw new DemoError(404, 'Dieses Mitglied gibt es nicht mehr.', 'member_gone');
    user.pin = pin;
    user.defaultPin = false;
    save(data);
    return adminView(data);
  }
  if ((m = route.match(/^PATCH \/admin\/users\/([^/]+)$/))) {
    admin();
    const id = decodeURIComponent(m[1]);
    const user = data.users.find(u => u.id === id);
    if (!user) throw new DemoError(404, 'Dieses Mitglied gibt es nicht mehr.', 'member_gone');
    if (body && body.name !== undefined) {
      const name = nameOf(body.name);
      if (data.users.some(u => u.id !== id && sameName(u.name, name))) throw new DemoError(409, 'Schon eingetragen.', 'name_taken', { name });
      user.name = name;
    }
    if (body && body.pin) {
      user.pin = pinOf(body.pin);
      user.defaultPin = false;
    }
    save(data);
    return adminView(data);
  }
  if ((m = route.match(/^DELETE \/admin\/users\/([^/]+)$/))) {
    admin();
    const id = decodeURIComponent(m[1]);
    if (!data.users.some(u => u.id === id)) throw new DemoError(404, 'Dieses Mitglied ist schon gelöscht.', 'member_deleted');
    data.users = data.users.filter(u => u.id !== id);
    delete data.contributions[id];
    delete data.grossBids[id];
    delete data.hours[id];
    save(data);
    return adminView(data);
  }
  if (route === 'PUT /admin/target') {
    admin();
    const target = amount(body && body.targetAmount, 'target');
    if (!(target > 0)) throw new DemoError(400, 'Der Bedarf muss größer als 0 sein.', 'target_positive');
    data.targetAmount = target;
    save(data);
    return adminView(data);
  }
  if (route === 'GET /admin/export') {
    admin();
    throw new DemoError(400, 'Exporte sind in der Demo ausgeschaltet.', 'demo_no_export');
  }
  if (route === 'POST /admin/import') {
    admin();
    const users = Array.isArray(body && body.users) ? body.users : [];
    const next = { ...data, users: [], contributions: {}, grossBids: {}, hours: {} };
    for (const u of users) {
      const name = nameOf(u && u.name);
      const known = data.users.find(p => sameName(p.name, name));
      const user = known ? { ...known, name } : { id: `demo${Math.random().toString(36).slice(2, 9)}`, name, pin: DEMO_PIN, defaultPin: false };
      if (u.pin) user.pin = pinOf(String(u.pin));
      next.users.push(user);
      const net = amount(u.contribution !== undefined ? u.contribution : (body.contributions || {})[u.id] || 0, 'amount');
      if (net > 0) next.contributions[user.id] = net;
      const hours = amount(u.hours !== undefined ? u.hours : (body.hours || {})[u.id] || 0, 'hours', 744);
      if (hours > 0) next.hours[user.id] = hours;
    }
    if (Number(body.targetAmount) > 0) next.targetAmount = amount(body.targetAmount, 'target');
    save(next);
    return { ...adminView(next), imported: next.users.length };
  }
  throw new DemoError(404, 'Gibt es in der Demo nicht.', 'unknown_route');
}

// Same contract as api() in lib.js: resolves with the response, throws with status and message.
export async function demoApi(path, { method = 'GET', body, token } = {}) {
  await new Promise(resolve => setTimeout(resolve, 180)); // feels like a real server
  const copy = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
  return JSON.parse(JSON.stringify(handle(method, path, copy, token)));
}
