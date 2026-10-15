const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');
const SECRET_FILE = path.join(DATA_DIR, 'session-secret');

const DEFAULT_PIN = '1234';
const ADMIN_DEFAULT_PIN = '0000';
const PIN_PATTERN = /^\d{4,6}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_AMOUNT = 1000000;
const MAX_HOURS = 744; // hours in a 31-day month
const MAX_STEP = 10000;
const MAX_NAME_LENGTH = 60;
const MEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const DAILY_BACKUPS_TO_KEEP = 60;

// Login throttling: after LOCK_AFTER wrong PINs the login is locked, starting at
// one minute and doubling with every further failure (max. one hour).
const LOCK_AFTER = 5;
const MAX_LOCK_MS = 60 * 60 * 1000;
const FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 50;

// Uberspace puts exactly one reverse proxy in front of the app.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Uberspace forwards /api with the full path, so all routes live under /api.
const api = express.Router();
api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 does not catch rejected promises, so async handlers are wrapped.
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const round2 = (n) => Math.round(n * 100) / 100;
const isAdminId = (id) => id === 'admin';
const sameName = (a, b) => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');
const formatAmount = (n) => n.toLocaleString('de-DE');

function requirePin(pin, where = '') {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    throw new HttpError(400, `${where ? `${where}: ` : ''}Die PIN muss aus 4 bis 6 Ziffern bestehen.`);
  }
  return pin;
}

function requireName(name, where = '') {
  const clean = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  if (!clean || clean.length > MAX_NAME_LENGTH) {
    throw new HttpError(400, `${where ? `${where}: ` : ''}Bitte gib einen Namen mit höchstens ${MAX_NAME_LENGTH} Zeichen ein.`);
  }
  return clean;
}

// Hours per month a member can contribute; half hours are allowed.
function requireHours(value, label = 'Die Stunden') {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value.replace(',', '.')) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_HOURS) {
    throw new HttpError(400, `${label} müssen zwischen 0 und ${MAX_HOURS} liegen.`);
  }
  return Math.round(n * 2) / 2;
}

function requireAmount(value, label) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
    throw new HttpError(400, `${label} muss eine Zahl zwischen 0 und ${formatAmount(MAX_AMOUNT)} sein.`);
  }
  return round2(n);
}

// PIN hashing (scrypt, built into Node)

const scrypt = (pin, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(pin, salt, 32, (err, key) => (err ? reject(err) : resolve(key)));
});

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pin, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function checkPin(pin, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash || typeof pin !== 'string') return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(pin, Buffer.from(salt, 'base64'));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

async function setPin(user, pin, pinHash) {
  user.pinHash = pinHash || await hashPin(pin);
  user.pinVersion = (user.pinVersion || 0) + 1;
  user.defaultPin = pin === (isAdminId(user.id) ? ADMIN_DEFAULT_PIN : DEFAULT_PIN);
  delete user.pin;
}

// Database file

async function initDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initialData = {
      rev: 0,
      users: [
        { id: 'admin', name: 'Admin', pin: ADMIN_DEFAULT_PIN }
      ],
      contributions: {},
      targetAmount: 1000
    };
    await fs.writeFile(DATA_FILE, JSON.stringify(initialData, null, 2), { mode: 0o600 });
    console.log('Database initialized at', DATA_FILE);
  }
}

async function readDatabase() {
  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  data.contributions = data.contributions || {};
  data.hours = data.hours || {};
  return data;
}

// Write to a temp file and rename it, so a crash never leaves a half-written database.
async function writeDatabase(data) {
  const tmp = `${DATA_FILE}.tmp`;
  const file = await fs.open(tmp, 'w', 0o600);
  try {
    await file.writeFile(JSON.stringify(data, null, 2));
    await file.sync();
  } finally {
    await file.close();
  }
  await fs.rename(tmp, DATA_FILE);
}

// Keeps a copy of the database as it was before the first change of each day.
async function backupOncePerDay() {
  const day = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `database-${day}.json`);
  try {
    await fs.access(target);
    return;
  } catch {
    // no backup for today yet
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.copyFile(DATA_FILE, target);
  const daily = (await fs.readdir(BACKUP_DIR))
    .filter(f => /^database-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  for (const old of daily.slice(0, -DAILY_BACKUPS_TO_KEEP)) {
    await fs.unlink(path.join(BACKUP_DIR, old));
  }
}

async function backupBeforeImport() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(DATA_FILE, path.join(BACKUP_DIR, `database-${stamp}-before-import.json`));
}

// All writes run one after another through this queue. Every change re-reads the
// file, so concurrent requests can never overwrite each other's bids.
let writeQueue = Promise.resolve();

function mutate(change, { backup = true } = {}) {
  const run = writeQueue.then(async () => {
    const data = await readDatabase();
    const result = await change(data);
    data.rev = (data.rev || 0) + 1;
    if (backup) await backupOncePerDay();
    await writeDatabase(data);
    return { data, result };
  });
  writeQueue = run.catch(() => {});
  return run;
}

// Append-only log of every change, so each bid can be traced and restored.
async function audit(event, details = {}) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...details });
  try {
    await fs.appendFile(AUDIT_FILE, `${line}\n`, { mode: 0o600 });
  } catch (error) {
    console.error('Error writing audit log:', error);
  }
}

// Converts the old format (plain-text PINs) and drops invalid amounts.
async function migrateDatabase() {
  const data = await readDatabase();
  const outdated = data.rev === undefined
    || data.users.some(u => u.pin !== undefined || !u.pinHash)
    || Object.values(data.contributions).some(v => typeof v !== 'number' || !(v > 0));
  if (!outdated) return;

  // No daily backup here: it would keep the plain-text PINs around.
  await mutate(async (data) => {
    for (const user of data.users) {
      if (user.pin !== undefined || !user.pinHash) {
        const fallback = isAdminId(user.id) ? ADMIN_DEFAULT_PIN : DEFAULT_PIN;
        await setPin(user, typeof user.pin === 'string' && user.pin ? user.pin : fallback);
      }
    }
    for (const [id, value] of Object.entries(data.contributions)) {
      const amount = Number(value);
      if (Number.isFinite(amount) && amount > 0 && data.users.some(u => u.id === id)) {
        data.contributions[id] = round2(amount);
      } else {
        delete data.contributions[id];
      }
    }
  }, { backup: false });
  await audit('migrated', { note: 'PINs hashed' });
  console.log('Database migrated: PINs are stored as hashes now.');
}

// Sessions: signed tokens, no server-side state. Changing a PIN bumps
// pinVersion, which ends all older sessions of that account.

let sessionSecret;

async function loadSessionSecret() {
  try {
    sessionSecret = await fs.readFile(SECRET_FILE);
  } catch {
    sessionSecret = crypto.randomBytes(32);
    await fs.writeFile(SECRET_FILE, sessionSecret, { mode: 0o600 });
  }
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readSession(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function issueSession(user) {
  const role = isAdminId(user.id) ? 'admin' : 'member';
  const ttl = role === 'admin' ? ADMIN_SESSION_MS : MEMBER_SESSION_MS;
  const token = signSession({ uid: user.id, pv: user.pinVersion, role, exp: Date.now() + ttl });
  return { token, role, user: { id: user.id, name: user.name } };
}

function authenticate(role) {
  return handle(async (req, res, next) => {
    const header = req.get('Authorization') || '';
    const session = readSession(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (!session || session.role !== role) throw new HttpError(401, 'Bitte melde dich neu an.');
    const data = await readDatabase();
    const user = data.users.find(u => u.id === session.uid);
    if (!user || user.pinVersion !== session.pv) throw new HttpError(401, 'Bitte melde dich neu an.');
    req.user = user;
    req.data = data;
    next();
  });
}

function findUserOrLogout(data, userId) {
  const user = data.users.find(u => u.id === userId);
  if (!user) throw new HttpError(401, 'Bitte melde dich neu an.');
  return user;
}

// Login throttling state (in memory; a restart resets it). Locks apply per account
// and client address, so wrong PINs from one device never lock out anybody else.

const failedLogins = new Map();
const failedByIp = new Map();

// Without a forwarded client address all requests look alike; then the lock
// falls back to the account alone and the address limit is skipped.
const isLoopback = (ip) => !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
const lockKey = (userId, ip) => `${userId}|${isLoopback(ip) ? '' : ip}`;

function waitMessage(ms) {
  const minutes = Math.ceil(ms / 60000);
  return `Zu viele Fehlversuche. Versuche es in ${minutes === 1 ? 'einer Minute' : `${minutes} Minuten`} wieder.`;
}

function assertLoginAllowed(userId, ip) {
  const now = Date.now();
  const byIp = failedByIp.get(ip);
  if (!isLoopback(ip) && byIp && byIp.resetAt > now && byIp.count >= IP_MAX_FAILURES) {
    throw new HttpError(429, waitMessage(byIp.resetAt - now));
  }
  const entry = failedLogins.get(lockKey(userId, ip));
  if (entry && entry.lockedUntil > now) {
    throw new HttpError(429, waitMessage(entry.lockedUntil - now));
  }
}

function registerFailedLogin(userId, ip) {
  const now = Date.now();
  for (const [key, entry] of failedByIp) {
    if (entry.resetAt <= now) failedByIp.delete(key);
  }
  for (const [key, entry] of failedLogins) {
    if (now - entry.lastAt > FAILURE_MEMORY_MS) failedLogins.delete(key);
  }
  if (!isLoopback(ip)) {
    const byIp = failedByIp.get(ip);
    if (byIp) byIp.count += 1;
    else failedByIp.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
  }

  const key = lockKey(userId, ip);
  const entry = failedLogins.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lastAt = now;
  failedLogins.set(key, entry);
  if (entry.count < LOCK_AFTER) {
    const left = LOCK_AFTER - entry.count;
    return `PIN falsch. Noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}, dann wird die Anmeldung kurz gesperrt.`;
  }
  const lockMs = Math.min(MAX_LOCK_MS, 60 * 1000 * 2 ** (entry.count - LOCK_AFTER));
  entry.lockedUntil = now + lockMs;
  return `PIN falsch. ${waitMessage(lockMs)}`;
}

// A new PIN from the admin also lifts every lock on that account.
function clearFailedLogins(userId) {
  for (const key of failedLogins.keys()) {
    if (key.startsWith(`${userId}|`)) failedLogins.delete(key);
  }
}

// Response shapes

function summary(data) {
  const amounts = Object.values(data.contributions).filter(a => a > 0);
  const hours = Object.values(data.hours).filter(h => h > 0);
  return {
    rev: data.rev || 0,
    totalRaised: round2(amounts.reduce((sum, a) => sum + a, 0)),
    targetAmount: data.targetAmount,
    contributorCount: amounts.length,
    totalHours: hours.reduce((sum, h) => sum + h, 0)
  };
}

function memberView(data, user) {
  return {
    ...summary(data),
    user: { id: user.id, name: user.name, defaultPin: !!user.defaultPin },
    contribution: data.contributions[user.id] || 0,
    hours: data.hours[user.id] || 0
  };
}

function adminView(data) {
  const admin = data.users.find(u => isAdminId(u.id));
  return {
    ...summary(data),
    admin: { defaultPin: !!(admin && admin.defaultPin) },
    // Single bids stay out of the admin screen, like before; the export contains them.
    users: data.users
      .filter(u => !isAdminId(u.id))
      .map(u => ({ id: u.id, name: u.name, defaultPin: !!u.defaultPin }))
  };
}

function setContribution(data, userId, amount) {
  if (amount > 0) data.contributions[userId] = amount;
  else delete data.contributions[userId];
}

function setHours(data, userId, hours) {
  if (hours > 0) data.hours[userId] = hours;
  else delete data.hours[userId];
}

function idGenerator(taken) {
  let next = Date.now();
  return () => {
    while (taken(String(next))) next += 1;
    return String(next++);
  };
}

// Public routes

api.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Front page: names for the login list plus the overall progress. No PINs, no single bids.
api.get('/public', handle(async (req, res) => {
  const data = await readDatabase();
  res.json({
    ...summary(data),
    members: data.users.filter(u => !isAdminId(u.id)).map(u => ({ id: u.id, name: u.name }))
  });
}));

api.post('/login', handle(async (req, res) => {
  const { userId, pin } = req.body || {};
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'Ungültige Anfrage.');
  assertLoginAllowed(userId, req.ip);
  const data = await readDatabase();
  const user = data.users.find(u => u.id === userId);
  if (!user) {
    throw new HttpError(404, 'Diesen Namen gibt es nicht mehr. Lade die Seite neu.');
  }
  if (!await checkPin(pin, user.pinHash)) {
    const message = registerFailedLogin(user.id, req.ip);
    console.log(`[login] wrong PIN for ${user.id} from ${req.ip}`);
    throw new HttpError(401, message);
  }
  failedLogins.delete(lockKey(user.id, req.ip));
  res.json(issueSession(user));
}));

// Member routes

const memberOnly = authenticate('member');

api.get('/me', memberOnly, handle(async (req, res) => {
  res.json(memberView(req.data, req.user));
}));

// The server adds the step itself, so fast or parallel clicks are never lost.
api.post('/me/contribution', memberOnly, handle(async (req, res) => {
  const delta = req.body && req.body.delta;
  if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > MAX_STEP) {
    throw new HttpError(400, 'Ungültiger Betrag.');
  }
  const { data, result } = await mutate((data) => {
    const user = findUserOrLogout(data, req.user.id);
    const from = data.contributions[user.id] || 0;
    const to = round2(Math.min(MAX_AMOUNT, Math.max(0, from + delta)));
    setContribution(data, user.id, to);
    return { user, from, to };
  });
  await audit('bid', { userId: result.user.id, name: result.user.name, from: result.from, to: result.to });
  res.json(memberView(data, result.user));
}));

api.post('/me/contribution/withdraw', memberOnly, handle(async (req, res) => {
  const { data, result } = await mutate((data) => {
    const user = findUserOrLogout(data, req.user.id);
    const from = data.contributions[user.id] || 0;
    setContribution(data, user.id, 0);
    return { user, from };
  });
  await audit('withdraw', { userId: result.user.id, name: result.user.name, from: result.from, to: 0 });
  res.json(memberView(data, result.user));
}));

// Hours are set as an absolute value from a text field (not counted up like bids).
api.put('/me/hours', memberOnly, handle(async (req, res) => {
  const hours = requireHours(req.body && req.body.hours);
  const { data, result } = await mutate((data) => {
    const user = findUserOrLogout(data, req.user.id);
    const from = data.hours[user.id] || 0;
    setHours(data, user.id, hours);
    return { user, from };
  });
  await audit('hours', { userId: result.user.id, name: result.user.name, from: result.from, to: hours });
  res.json(memberView(data, result.user));
}));

api.put('/me/pin', memberOnly, handle(async (req, res) => {
  const pin = requirePin(req.body && req.body.pin);
  const { data, result } = await mutate(async (data) => {
    const user = findUserOrLogout(data, req.user.id);
    await setPin(user, pin);
    return user;
  });
  await audit('pin_changed', { userId: result.id, by: 'self' });
  res.json({ ...memberView(data, result), session: issueSession(result) });
}));

// Admin routes

const adminOnly = authenticate('admin');

api.get('/admin/data', adminOnly, handle(async (req, res) => {
  res.json(adminView(req.data));
}));

api.post('/admin/users', adminOnly, handle(async (req, res) => {
  const name = requireName(req.body && req.body.name);
  const pin = req.body && req.body.pin ? requirePin(req.body.pin) : DEFAULT_PIN;
  const { data, result } = await mutate(async (data) => {
    if (data.users.some(u => !isAdminId(u.id) && sameName(u.name, name))) {
      throw new HttpError(409, `„${name}“ ist schon eingetragen.`);
    }
    const nextId = idGenerator(id => data.users.some(u => u.id === id));
    const user = { id: nextId(), name };
    await setPin(user, pin);
    data.users.push(user);
    return user;
  });
  await audit('user_added', { userId: result.id, name: result.name });
  res.json({ ...adminView(data), added: { id: result.id, name: result.name, defaultPin: result.defaultPin } });
}));

api.delete('/admin/users/:userId', adminOnly, handle(async (req, res) => {
  const { userId } = req.params;
  if (isAdminId(userId)) throw new HttpError(400, 'Das Admin-Konto kann nicht gelöscht werden.');
  const { data, result } = await mutate((data) => {
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new HttpError(404, 'Dieses Mitglied ist schon gelöscht.');
    const contribution = data.contributions[userId] || 0;
    const hours = data.hours[userId] || 0;
    data.users = data.users.filter(u => u.id !== userId);
    delete data.contributions[userId];
    delete data.hours[userId];
    return { user, contribution, hours };
  });
  await audit('user_deleted', { userId, name: result.user.name, contribution: result.contribution, hours: result.hours });
  res.json(adminView(data));
}));

// The admin can set the PIN of every account, including their own.
api.put('/admin/users/:userId/pin', adminOnly, handle(async (req, res) => {
  const pin = requirePin(req.body && req.body.pin);
  const { data, result } = await mutate(async (data) => {
    const user = data.users.find(u => u.id === req.params.userId);
    if (!user) throw new HttpError(404, 'Dieses Mitglied gibt es nicht mehr.');
    await setPin(user, pin);
    return user;
  });
  clearFailedLogins(result.id);
  await audit('pin_changed', { userId: result.id, by: 'admin' });
  res.json({
    ...adminView(data),
    session: isAdminId(result.id) ? issueSession(result) : undefined
  });
}));

api.put('/admin/target', adminOnly, handle(async (req, res) => {
  const targetAmount = requireAmount(req.body && req.body.targetAmount, 'Der Bedarf');
  if (targetAmount <= 0) throw new HttpError(400, 'Der Bedarf muss größer als 0 sein.');
  const { data, result } = await mutate((data) => {
    const from = data.targetAmount;
    data.targetAmount = targetAmount;
    return { from };
  });
  await audit('target_changed', { from: result.from, to: targetAmount });
  res.json(adminView(data));
}));

// Exports never contain PINs or PIN hashes.
api.get('/admin/export', adminOnly, handle(async (req, res) => {
  const data = req.data;
  res.json({
    users: data.users.filter(u => !isAdminId(u.id)).map(u => ({ id: u.id, name: u.name })),
    contributions: data.contributions,
    hours: data.hours,
    targetAmount: data.targetAmount,
    exportDate: new Date().toISOString()
  });
}));

// Replaces all members and bids (the admin account stays). Members are matched to
// existing ones by id or name: without a PIN in the file they keep their PIN,
// new members get the default PIN.
api.post('/admin/import', adminOnly, handle(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.users)) throw new HttpError(400, 'Die Datei enthält keine Mitgliederliste.');
  const contributionsIn = body.contributions && typeof body.contributions === 'object' ? body.contributions : {};
  const hoursIn = body.hours && typeof body.hours === 'object' ? body.hours : {};
  const hasTarget = body.targetAmount !== undefined && body.targetAmount !== null && body.targetAmount !== '';
  const targetAmount = hasTarget ? requireAmount(body.targetAmount, 'Der Bedarf') : null;

  const entries = body.users
    .filter(u => u && !isAdminId(u.id))
    .map((u, i) => {
      const where = Number.isInteger(u.line) ? `Zeile ${u.line}` : `Eintrag ${i + 1}`;
      const id = u.id !== undefined && u.id !== null ? String(u.id) : '';
      const pinGiven = u.pin !== undefined && u.pin !== null && u.pin !== '';
      const rawAmount = u.contribution !== undefined ? u.contribution : contributionsIn[id];
      const amountGiven = rawAmount !== undefined && rawAmount !== null && rawAmount !== '';
      const rawHours = u.hours !== undefined ? u.hours : hoursIn[id];
      const hoursGiven = rawHours !== undefined && rawHours !== null && rawHours !== '';
      return {
        where,
        id: ID_PATTERN.test(id) ? id : null,
        name: requireName(u.name, where),
        pin: pinGiven ? requirePin(String(u.pin), where) : null,
        contribution: amountGiven ? requireAmount(rawAmount, `${where}: Der Betrag`) : 0,
        hours: hoursGiven ? requireHours(rawHours, `${where}: Die Stunden`) : 0
      };
    });
  entries.forEach((entry, i) => {
    const twin = entries.findIndex(other => sameName(other.name, entry.name));
    if (twin !== i) throw new HttpError(400, `„${entry.name}“ steht doppelt in der Datei (${entries[twin].where} und ${entry.where}).`);
  });

  const { data, result } = await mutate(async (data) => {
    await backupBeforeImport();
    const admin = data.users.find(u => isAdminId(u.id));
    const previous = data.users.filter(u => !isAdminId(u.id));
    const used = new Set(['admin']);
    const nextId = idGenerator(id => used.has(id) || previous.some(p => p.id === id));
    const defaultHash = await hashPin(DEFAULT_PIN);
    const users = [];
    const contributions = {};
    const hours = {};

    for (const entry of entries) {
      const match = previous.find(p => !used.has(p.id) && entry.id && p.id === entry.id)
        || previous.find(p => !used.has(p.id) && sameName(p.name, entry.name));
      const freshId = entry.id && !used.has(entry.id) && !previous.some(p => p.id === entry.id) ? entry.id : null;
      const user = match ? { ...match, name: entry.name } : { id: freshId || nextId(), name: entry.name };
      used.add(user.id);

      if (entry.pin && !(match && await checkPin(entry.pin, match.pinHash))) {
        await setPin(user, entry.pin);
      } else if (!match) {
        await setPin(user, DEFAULT_PIN, defaultHash);
      }
      users.push(user);
      if (entry.contribution > 0) contributions[user.id] = entry.contribution;
      if (entry.hours > 0) hours[user.id] = entry.hours;
    }

    data.users = [admin, ...users];
    data.contributions = contributions;
    data.hours = hours;
    if (targetAmount) data.targetAmount = targetAmount;
    return { count: users.length };
  });
  const totals = summary(data);
  await audit('import', { users: result.count, totalRaised: totals.totalRaised, totalHours: totals.totalHours });
  res.json({ ...adminView(data), imported: result.count });
}));

api.use((req, res) => {
  res.status(404).json({ error: 'Unbekannte Adresse.' });
});

app.use('/api', api);

app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Ungültige Anfrage.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Die Datei ist zu groß.' });
  }
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Serverfehler. Bitte versuche es noch einmal.' });
});

// Start server
async function start() {
  await initDatabase();
  await loadSessionSecret();
  await migrateDatabase();
  return new Promise((resolve) => {
    const server = app.listen(PORT, process.env.HOST, () => {
      console.log(`Server running on port ${server.address().port}`);
      console.log(`API available at http://localhost:${server.address().port}/api`);
      resolve(server);
    });
  });
}

module.exports = { app, start };

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
