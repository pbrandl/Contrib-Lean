const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const net = require('net');
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
const PIN_PATTERN = /^\d{4,8}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const MAX_AMOUNT = 1000000;
const MAX_HOURS = 744; // hours in a 31-day month
// Bids are netto; brutto (with 19 % VAT) is shown on request and in the export.
// Computed in whole cents, like toGross in frontend/src/lib.js, so half cents round up.
const VAT_PERCENT = 19;
const toGross = (net) => Math.round((Math.round(net * 100) * (100 + VAT_PERCENT)) / 100) / 100;
// A brutto amount typed by a member, in netto, rounded up to the cent (like toNet in lib.js).
const toNet = (gross) => Math.ceil((Math.round(gross * 100) * 100) / (100 + VAT_PERCENT)) / 100;
const MAX_NAME_LENGTH = 60;
const MEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
const DAILY_BACKUPS_TO_KEEP = 60;
const HOURLY_BACKUPS_TO_KEEP = 48;
const MAX_IMPORT_ENTRIES = 5000;
const START_PIN_DIGITS = 4;
// Writes per member (bids, hours, PIN): 50 at once, then 10 per second. A page sends
// at most one request per click, so only a script can reach this.
const WRITE_LIMIT = { burst: 50, refillMs: 100 };
// Changes with every start, so pages accept a lower rev after a backup was restored.
const BOOT = crypto.randomBytes(6).toString('base64url');

// Login throttling (in memory, a restart resets it). Nothing is keyed by IP address alone:
// at the meeting hundreds of phones share one address.
// Own device: after LOCK_AFTER wrong PINs for an account the device is locked for it,
// starting at one minute and doubling with every further failure (max. one hour).
const LOCK_AFTER = 5;
const MAX_LOCK_MS = 60 * 60 * 1000;
const FAILURE_MEMORY_MS = 24 * 60 * 60 * 1000;
const MAX_DEVICE_ENTRIES = 10000;
// Attempts from devices that are not trusted for the account take one attempt from two
// budgets; a right PIN gives both back.
// Per account and network (IPv4 address or IPv6 /64): an attacker elsewhere only uses up
// the budget of their own network, never the one of the meeting.
const NETWORK_LIMITS = {
  member: { burst: 20, refillMs: 18 * 60 * 1000 }, // 20, then one every 18 minutes
  admin: { burst: 10, refillMs: 2 * 60 * 60 * 1000 } // 10, then one every 2 hours
};
// Per account across all networks, against guessing from many addresses. It does not apply
// to the network the admin logged in from in the last 24 hours (the meeting's WLAN), so
// nobody outside can block the meeting.
const ACCOUNT_LIMITS = {
  member: { burst: 100, refillMs: 24 * 60 * 60 * 1000 / 100 }, // 100, then 100 a day
  admin: { burst: 30, refillMs: 60 * 60 * 1000 } // 30, then one an hour
};
const TRUSTED_NETWORK_MS = 24 * 60 * 60 * 1000;
const MAX_BUDGET_ENTRIES = 20000;
// Browsers send a random device id; after a right PIN they get a signed credential
// ("trusted device") that lets them skip both budgets.
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const TRUST_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 1000;
// scrypt runs on libuv's 4 threads, which file access needs too.
const MAX_PARALLEL_PIN_CHECKS = 2;
const MAX_WAITING_PIN_CHECKS = 200;
const MAX_PIN_WAIT_MS = 8000; // beyond that the server answers 503 instead of letting the page wait

// Uberspace puts exactly one reverse proxy in front of the app.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// API answers are JSON only: never cached, never shown in a frame, never sniffed as HTML.
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  next();
});

// Small request bodies everywhere. Only the import gets 1 MB, and only after the admin
// session was checked (see the import route).
const IMPORT_PATH = '/api/admin/import';
const smallJson = express.json({ limit: '16kb' });
const importJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (req.path === IMPORT_PATH ? next() : smallJson(req, res, next)));

// Uberspace forwards /api with the full path, so all routes live under /api.
const api = express.Router();

class HttpError extends Error {
  constructor(status, message, retryAfterMs) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Express 4 does not catch rejected promises, so async handlers are wrapped.
const handle = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const round2 = (n) => Math.round(n * 100) / 100;
const isAdminId = (id) => id === 'admin';
const nameKey = (name) => String(name).normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
const sameName = (a, b) => nameKey(a) === nameKey(b);
const formatAmount = (n) => n.toLocaleString('de-DE');
const own = (object, key) => (Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined);

function requirePin(pin, where = '') {
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    throw new HttpError(400, `${where ? `${where}: ` : ''}Die PIN muss aus 4 bis 8 Ziffern bestehen.`);
  }
  return pin;
}

// Names are shown to everybody, so invisible and direction-changing characters are
// removed: nobody can add a look-alike of an existing name.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/g;

function requireName(name, where = '') {
  const clean = typeof name === 'string' ? name.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim() : '';
  if (!clean || clean.length > MAX_NAME_LENGTH) {
    throw new HttpError(400, `${where ? `${where}: ` : ''}Bitte gib einen Namen mit höchstens ${MAX_NAME_LENGTH} Zeichen ein.`);
  }
  return clean;
}

// Numbers come as JSON numbers or as plain decimal strings ("12.5", with `comma` also "4,5"),
// never as "0x10", "1e3" or " ".
function toNumber(value, comma = false) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const s = value.trim();
  return (comma ? /^\d+([.,]\d+)?$/ : /^\d+(\.\d+)?$/).test(s) ? Number(s.replace(',', '.')) : NaN;
}

// Hours per month a member can contribute, with one decimal.
function requireHours(value, label = 'Die Stunden') {
  const n = toNumber(value, true);
  if (!Number.isFinite(n) || n < 0 || n > MAX_HOURS) {
    throw new HttpError(400, `${label} müssen zwischen 0 und ${MAX_HOURS} liegen.`);
  }
  return Math.round(n * 10) / 10;
}

function requireAmount(value, label) {
  const n = toNumber(value);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
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

// `hash`: computed before entering the write queue, so scrypt never holds up other writes.
// `start`: a start PIN the admin handed out; otherwise only the shared default PIN counts as one.
async function setPin(user, pin, { hash, start } = {}) {
  user.pinHash = hash || await hashPin(pin);
  user.pinVersion = (user.pinVersion || 0) + 1;
  user.defaultPin = start !== undefined ? start : pin === (isAdminId(user.id) ? ADMIN_DEFAULT_PIN : DEFAULT_PIN);
  delete user.pin;
}

// Start PIN for a member the admin adds: random, never the shared 1234 or 0000.
function randomStartPin() {
  let pin;
  do {
    pin = String(crypto.randomInt(0, 10 ** START_PIN_DIGITS)).padStart(START_PIN_DIGITS, '0');
  } while (pin === DEFAULT_PIN || pin === ADMIN_DEFAULT_PIN);
  return pin;
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
  data.grossBids = data.grossBids || {};
  // Request ids of the old step-wise bids (before October 2026); nothing reads them any more.
  delete data.requests;
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

// Keeps a copy of the database as it was before the first change of each day (UTC date,
// kept 60 days) and of each hour (UTC, kept 48 hours), so a busy evening has restore points.
async function makeBackups() {
  const stamp = new Date().toISOString();
  try {
    await backupOnce(`database-${stamp.slice(0, 10)}.json`, /^database-\d{4}-\d{2}-\d{2}\.json$/, DAILY_BACKUPS_TO_KEEP);
    await backupOnce(`database-${stamp.slice(0, 10)}-${stamp.slice(11, 13)}h.json`, /^database-\d{4}-\d{2}-\d{2}-\d{2}h\.json$/, HOURLY_BACKUPS_TO_KEEP);
  } catch (error) {
    // A failing backup (e.g. a full disk) must not stop the bids.
    console.error('Error writing backup:', error);
  }
}

async function backupOnce(name, pattern, keep) {
  const target = path.join(BACKUP_DIR, name);
  try {
    await fs.access(target);
    return;
  } catch {
    // no backup for this day or hour yet
  }
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  await fs.copyFile(DATA_FILE, target);
  const files = (await fs.readdir(BACKUP_DIR)).filter(f => pattern.test(f)).sort();
  for (const old of files.slice(0, -keep)) {
    await fs.unlink(path.join(BACKUP_DIR, old));
  }
}

async function backupBeforeImport() {
  await fs.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(DATA_FILE, path.join(BACKUP_DIR, `database-${stamp}-before-import.json`));
}

// All writes run one after another through this queue. Every change re-reads the
// file, so concurrent requests can never overwrite each other's bids.
// `change(data, log)` records audit lines with log(event, details); they are written
// after the database, still inside the queue, so the log has the order of the changes.
let writeQueue = Promise.resolve();

function mutate(change, { backup = true } = {}) {
  const run = writeQueue.then(async () => {
    const data = await readDatabase();
    const events = [];
    const result = await change(data, (event, details) => events.push([event, details]));
    data.rev = (data.rev || 0) + 1;
    if (backup) await makeBackups();
    await writeDatabase(data);
    for (const [event, details] of events) {
      await audit(event, { rev: data.rev, ...details });
    }
    return { data, result };
  });
  writeQueue = run.catch(() => {});
  return run;
}

// Who made a request: address, browser and the start of the device id, so a bid in
// somebody else's name can be traced to a device. Never the PIN.
function requestInfo(req) {
  const device = deviceIdOf(req.get('X-Device')) || deviceIdOf(req.body && req.body.device);
  return {
    ip: req.ip,
    ua: String(req.get('User-Agent') || '').slice(0, 200),
    device: device ? device.slice(0, 8) : undefined
  };
}

// Append-only log of every change and login, so each bid can be traced and restored.
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
let trustKey;

async function loadSessionSecret() {
  try {
    sessionSecret = await fs.readFile(SECRET_FILE);
  } catch (error) {
    // Only a missing file is replaced; a file we cannot read stops the start
    // instead of silently logging everybody out.
    if (error.code !== 'ENOENT') throw error;
    sessionSecret = null;
  }
  // An empty or short secret would make sessions forgeable.
  if (!sessionSecret || sessionSecret.length < 32) {
    if (sessionSecret) console.warn('session-secret was too short, created a new one (everybody has to log in again).');
    sessionSecret = crypto.randomBytes(32);
    await fs.writeFile(SECRET_FILE, sessionSecret, { mode: 0o600 });
  }
  // Own key for device credentials, so one can never be used as the other.
  trustKey = crypto.createHmac('sha256', sessionSecret).update('trusted-device').digest();
}

function signSession(payload, key = sessionSecret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readSession(token, key = sessionSecret) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', key).update(body).digest();
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

// Login throttling state (in memory; a restart resets it).

const deviceFailures = new Map(); // lockKey -> { count, lockedUntil, lastAt }, oldest failure first
const networkBudgets = new Map(); // `${userId}|${network}` -> bucket
const accountBudgets = new Map(); // userId -> bucket
const trustedNetworks = new Map(); // network -> until (where the admin logged in)
const loginsInFlight = new Set(); // lockKeys with a PIN check running
let prunedAt = 0;

const deviceIdOf = (value) => (typeof value === 'string' && DEVICE_PATTERN.test(value) ? value : null);

// Without a forwarded client address all requests look alike.
const isLoopback = (ip) => !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

// IPv4 address, or the /64 of an IPv6 address (one phone or home gets a whole /64).
function networkOf(ip) {
  if (isLoopback(ip)) return '';
  const v4 = String(ip).replace(/^::ffff:/i, '');
  if (net.isIPv4(v4)) return v4;
  if (!net.isIPv6(ip)) return String(ip);
  const [head, tail] = ip.split('%')[0].split('::');
  const parts = (s) => (s ? s.split(':') : []);
  const count = (s) => parts(s).reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  const groups = tail === undefined
    ? parts(head)
    : [...parts(head), ...Array(8 - count(head) - count(tail)).fill('0'), ...parts(tail)];
  return `${groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

// Own-device lock: per account and browser. Pages without a device id (old version)
// fall back to account and network, and to the account alone without a forwarded address.
const lockKey = (userId, deviceId, ip) => `${userId}|${deviceId ? `d:${deviceId}` : `n:${networkOf(ip)}`}`;

const limitKind = (userId) => (isAdminId(userId) ? 'admin' : 'member');

function issueTrust(user, deviceId) {
  return signSession({ uid: user.id, did: deviceId, pv: user.pinVersion, exp: Date.now() + TRUST_MS }, trustKey);
}

// A credential only counts for the account, the browser and the PIN it was issued for.
function isTrusted(token, user, deviceId) {
  if (!deviceId || typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return false;
  const trust = readSession(token, trustKey);
  return !!trust && trust.uid === user.id && trust.did === deviceId && trust.pv === user.pinVersion;
}

function waitText(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return 'einer Minute';
  return minutes <= 90 ? `${minutes} Minuten` : `${Math.ceil(minutes / 60)} Stunden`;
}

const waitMessage = (ms) => `Zu viele Fehlversuche. Versuche es in ${waitText(ms)} wieder.`;

const isTrustedNetwork = (network, now) => (trustedNetworks.get(network) || 0) > now;

// Token bucket: refilled to `now`, moved to the end of the map (newest last), capped in size.
function bucket(map, key, limits, now) {
  const b = map.get(key) || { tokens: limits.burst, at: now, limits };
  b.tokens = Math.min(limits.burst, b.tokens + (now - b.at) / limits.refillMs);
  b.at = now;
  map.delete(key);
  map.set(key, b);
  if (map.size > MAX_BUDGET_ENTRIES) map.delete(map.keys().next().value);
  return b;
}

const isFull = (b, now) => b.tokens + (now - b.at) / b.limits.refillMs >= b.limits.burst;

function pruneLoginState(now) {
  if (now - prunedAt < 60 * 1000 && deviceFailures.size < MAX_DEVICE_ENTRIES) return;
  prunedAt = now;
  for (const [key, entry] of deviceFailures) {
    if (now - entry.lastAt > FAILURE_MEMORY_MS) deviceFailures.delete(key);
  }
  // Still too many (somebody keeps inventing device ids): forget the oldest failures.
  // The budgets still count them.
  for (const key of deviceFailures.keys()) {
    if (deviceFailures.size < MAX_DEVICE_ENTRIES * 0.9) break;
    deviceFailures.delete(key);
  }
  for (const map of [networkBudgets, accountBudgets]) {
    for (const [key, b] of map) if (isFull(b, now)) map.delete(key);
  }
  for (const [network, until] of trustedNetworks) if (until <= now) trustedNetworks.delete(network);
}

function assertDeviceAllowed(key) {
  const now = Date.now();
  const entry = deviceFailures.get(key);
  if (entry && entry.lockedUntil > now) {
    throw new HttpError(429, waitMessage(entry.lockedUntil - now), entry.lockedUntil - now);
  }
}

// Takes one attempt from the network budget and (outside the admin's network) from the
// account budget, before scrypt, so parallel requests cannot overdraw them.
function takeAttempt(userId, network) {
  const now = Date.now();
  const kind = limitKind(userId);
  pruneLoginState(now);
  const local = bucket(networkBudgets, `${userId}|${network}`, NETWORK_LIMITS[kind], now);
  const global = isTrustedNetwork(network, now) ? null : bucket(accountBudgets, userId, ACCOUNT_LIMITS[kind], now);
  const empty = [local, global].find(b => b && b.tokens < 1);
  if (empty) {
    const waitMs = (1 - empty.tokens) * empty.limits.refillMs;
    const message = isAdminId(userId)
      ? `Für das Admin-Konto gab es zu viele Fehlversuche. Auf neuen Geräten geht die Anmeldung erst in ${waitText(waitMs)} wieder. Melde dich auf einem Gerät an, auf dem du schon einmal als Admin angemeldet warst.`
      : `Für dieses Konto gab es zu viele Fehlversuche. Auf neuen Geräten geht die Anmeldung erst in ${waitText(waitMs)} wieder. Melde dich auf einem Gerät an, auf dem du schon einmal angemeldet warst, oder lass dir von einem Admin eine neue PIN setzen.`;
    throw new HttpError(429, message, waitMs);
  }
  local.tokens -= 1;
  if (global) global.tokens -= 1;
  if (local.tokens < 1 || (global && global.tokens < 1)) {
    console.log(`[login] ${userId}: no attempts left for new devices${global && global.tokens < 1 ? '' : ` from ${network || 'loopback'}`}`);
  }
  return [local, global];
}

function returnAttempt(taken) {
  for (const b of taken) if (b) b.tokens = Math.min(b.limits.burst, b.tokens + 1);
}

function registerFailedLogin(key) {
  const now = Date.now();
  pruneLoginState(now);
  const entry = deviceFailures.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lastAt = now;
  deviceFailures.delete(key); // re-insert: the map stays ordered by the last failure
  deviceFailures.set(key, entry);
  if (entry.count < LOCK_AFTER) {
    const left = LOCK_AFTER - entry.count;
    return `PIN falsch. Noch ${left} ${left === 1 ? 'Versuch' : 'Versuche'}, dann wird die Anmeldung kurz gesperrt.`;
  }
  const lockMs = Math.min(MAX_LOCK_MS, 60 * 1000 * 2 ** (entry.count - LOCK_AFTER));
  entry.lockedUntil = now + lockMs;
  return `PIN falsch. ${waitMessage(lockMs)}`;
}

// A new PIN from the admin lifts every lock on that account and refills its budgets.
function clearFailedLogins(userId) {
  for (const map of [deviceFailures, networkBudgets]) {
    for (const key of map.keys()) {
      if (key.startsWith(`${userId}|`)) map.delete(key);
    }
  }
  accountBudgets.delete(userId);
}

// At most MAX_PARALLEL_PIN_CHECKS scrypt runs at once (logins and new PINs), so a flood of
// logins leaves libuv threads for file access (bids). Trusted devices and logged-in members
// take turns with new devices, so neither side can starve the other. When the expected wait
// is too long the server says so (503) instead of letting pages time out; requests whose
// page has given up meanwhile are skipped.
let pinChecksRunning = 0;
let servedTrusted = false;
let scryptMs = 60; // running average
const waitingPinChecks = { trusted: [], other: [] };

function nextPinCheck() {
  const { trusted, other } = waitingPinChecks;
  const pick = servedTrusted ? (other.shift() || trusted.shift()) : (trusted.shift() || other.shift());
  return pick;
}

async function withPinSlot(req, trusted, fn) {
  if (pinChecksRunning < MAX_PARALLEL_PIN_CHECKS) {
    pinChecksRunning += 1;
  } else {
    const waiting = waitingPinChecks.trusted.length + waitingPinChecks.other.length;
    const queue = trusted ? waitingPinChecks.trusted : waitingPinChecks.other;
    if (queue.length >= MAX_WAITING_PIN_CHECKS || ((waiting + 1) * scryptMs) / MAX_PARALLEL_PIN_CHECKS > MAX_PIN_WAIT_MS) {
      throw new HttpError(503, 'Gerade melden sich sehr viele gleichzeitig an. Versuche es in ein paar Sekunden noch einmal.', 5000);
    }
    await new Promise(resolve => queue.push({ resolve, trusted }));
  }
  try {
    if (req.socket && req.socket.destroyed) throw new HttpError(499, 'Abgebrochen.');
    const started = Date.now();
    const result = await fn();
    scryptMs = scryptMs * 0.8 + (Date.now() - started) * 0.2;
    return result;
  } finally {
    const next = nextPinCheck();
    if (next) {
      servedTrusted = next.trusted;
      next.resolve(); // hand the slot over
    } else {
      pinChecksRunning -= 1;
    }
  }
}

const checkPinLimited = (req, pin, stored, trusted) => withPinSlot(req, trusted, () => checkPin(pin, stored));
// New PINs from logged-in members and the admin (scrypt as well).
const hashPinLimited = (req, pin) => withPinSlot(req, true, () => hashPin(pin));

// Response shapes

// Brutto of a bid: what the member typed if they bid brutto (that amount is leading),
// otherwise netto x 1.19.
function grossOf(data, userId) {
  const net = own(data.contributions, userId) || 0;
  if (!(net > 0)) return 0;
  const gross = own(data.grossBids, userId);
  return gross > 0 ? gross : toGross(net);
}

function summary(data) {
  const ids = Object.keys(data.contributions).filter(id => data.contributions[id] > 0);
  const amounts = ids.map(id => data.contributions[id]);
  const hours = Object.values(data.hours).filter(h => h > 0);
  return {
    rev: data.rev || 0,
    boot: BOOT,
    totalRaised: round2(amounts.reduce((sum, a) => sum + a, 0)),
    totalRaisedGross: round2(ids.reduce((sum, id) => sum + grossOf(data, id), 0)),
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
    contributionGross: grossOf(data, user.id),
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

// `gross`: the brutto amount the member typed; it stays leading for display and export.
// Without it (a netto bid) a former brutto amount is dropped.
function setContribution(data, userId, amount, gross = 0) {
  if (amount > 0) data.contributions[userId] = amount;
  else delete data.contributions[userId];
  if (amount > 0 && gross > 0) data.grossBids[userId] = gross;
  else delete data.grossBids[userId];
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
  const { userId, pin, device, trust } = req.body || {};
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'Ungültige Anfrage.');
  requirePin(pin); // can never match: no scrypt, no failure
  const data = await readDatabase();
  const user = data.users.find(u => u.id === userId);
  if (!user) {
    throw new HttpError(404, 'Diesen Namen gibt es nicht mehr. Lade die Seite neu.');
  }

  // Everything that turns an attempt down runs before scrypt.
  const deviceId = deviceIdOf(device);
  const network = networkOf(req.ip);
  const key = lockKey(user.id, deviceId, req.ip);
  assertDeviceAllowed(key);
  // One check at a time per device and account, so parallel requests cannot pass the lock.
  if (loginsInFlight.has(key)) {
    throw new HttpError(429, 'Die letzte Anmeldung wird noch geprüft. Versuche es gleich noch einmal.', 2000);
  }
  // A trusted device that typed LOCK_AFTER wrong PINs in a row counts as new until its next right PIN.
  const recent = deviceFailures.get(key);
  const trusted = isTrusted(trust, user, deviceId) && !(recent && recent.count >= LOCK_AFTER);
  const taken = trusted ? [] : takeAttempt(user.id, network);

  let ok;
  loginsInFlight.add(key);
  try {
    ok = await checkPinLimited(req, pin, user.pinHash, trusted);
  } catch (error) {
    returnAttempt(taken); // not checked (server busy, page gone): give it back
    throw error;
  } finally {
    loginsInFlight.delete(key);
  }
  if (!ok) {
    const message = registerFailedLogin(key);
    console.log(`[login] wrong PIN for ${user.id} from ${req.ip}${deviceId ? ` device ${deviceId.slice(0, 6)}` : ''}${trusted ? ' (trusted)' : ''}`);
    await audit('login_failed', { userId: user.id, trusted, ...requestInfo(req) });
    throw new HttpError(401, message);
  }
  returnAttempt(taken);
  deviceFailures.delete(key);
  // The admin's network (the meeting's WLAN) is exempt from the account-wide budgets.
  if (isAdminId(user.id)) trustedNetworks.set(network, Date.now() + TRUSTED_NETWORK_MS);
  await audit('login', { userId: user.id, trusted, ...requestInfo(req) });
  res.json({ ...issueSession(user), trust: deviceId ? issueTrust(user, deviceId) : undefined });
}));

// Member routes

const memberOnly = authenticate('member');

// Write budget per member, so one session cannot flood the shared write queue.
const writeBudgets = new Map(); // userId -> { tokens, at }

function limitWrites(req, res, next) {
  const now = Date.now();
  const budget = writeBudgets.get(req.user.id) || { tokens: WRITE_LIMIT.burst, at: now };
  budget.tokens = Math.min(WRITE_LIMIT.burst, budget.tokens + (now - budget.at) / WRITE_LIMIT.refillMs);
  budget.at = now;
  writeBudgets.set(req.user.id, budget);
  if (budget.tokens < 1) {
    next(new HttpError(429, 'Zu viele Änderungen auf einmal. Warte einen Moment.', WRITE_LIMIT.refillMs));
    return;
  }
  budget.tokens -= 1;
  next();
}

api.get('/me', memberOnly, handle(async (req, res) => {
  res.json(memberView(req.data, req.user));
}));

// The member sets the bid as a fixed amount with the keypad or the text field: netto as
// {amount}, or brutto as {gross} (then netto is derived and the brutto amount stays leading).
// Setting the same amount twice changes nothing, so a page may simply send it again.
api.put('/me/contribution', memberOnly, limitWrites, handle(async (req, res) => {
  const body = req.body || {};
  const gross = body.gross !== undefined ? requireAmount(body.gross, 'Der Beitrag') : 0;
  const amount = body.gross !== undefined ? toNet(gross) : requireAmount(body.amount, 'Der Beitrag');
  const { data, result } = await mutate((data, log) => {
    const user = findUserOrLogout(data, req.user.id);
    const from = data.contributions[user.id] || 0;
    setContribution(data, user.id, amount, gross);
    log('bid', { userId: user.id, name: user.name, from, to: amount, gross: gross || undefined, ...requestInfo(req) });
    return user;
  });
  res.json(memberView(data, result));
}));

// Hours are set as an absolute value from a text field (not counted up like bids).
api.put('/me/hours', memberOnly, limitWrites, handle(async (req, res) => {
  const hours = requireHours(req.body && req.body.hours);
  const { data, result } = await mutate((data, log) => {
    const user = findUserOrLogout(data, req.user.id);
    const from = data.hours[user.id] || 0;
    setHours(data, user.id, hours);
    log('hours', { userId: user.id, name: user.name, from, to: hours, ...requestInfo(req) });
    return user;
  });
  res.json(memberView(data, result));
}));

api.put('/me/pin', memberOnly, limitWrites, handle(async (req, res) => {
  const pin = requirePin(req.body && req.body.pin);
  const deviceId = deviceIdOf(req.body.device);
  const hash = await hashPinLimited(req, pin);
  const { data, result } = await mutate(async (data, log) => {
    const user = findUserOrLogout(data, req.user.id);
    await setPin(user, pin, { hash });
    log('pin_changed', { userId: user.id, by: 'self', ...requestInfo(req) });
    return user;
  });
  res.json({
    ...memberView(data, result),
    session: issueSession(result),
    trust: deviceId ? issueTrust(result, deviceId) : undefined
  });
}));

// Admin routes

const adminOnly = authenticate('admin');

api.get('/admin/data', adminOnly, handle(async (req, res) => {
  res.json(adminView(req.data));
}));

// New members get a random start PIN, shown to the admin once in `added.startPin`
// (never stored in plain text or logged). An explicit `pin` in the request is used as is.
api.post('/admin/users', adminOnly, handle(async (req, res) => {
  const name = requireName(req.body && req.body.name);
  const chosen = req.body && req.body.pin ? requirePin(req.body.pin) : null;
  const pin = chosen || randomStartPin();
  const hash = await hashPinLimited(req, pin);
  const { data, result } = await mutate(async (data, log) => {
    if (data.users.some(u => !isAdminId(u.id) && sameName(u.name, name))) {
      throw new HttpError(409, `„${name}“ ist schon eingetragen.`);
    }
    const nextId = idGenerator(id => data.users.some(u => u.id === id));
    const user = { id: nextId(), name };
    await setPin(user, pin, { hash, start: chosen ? undefined : true });
    data.users.push(user);
    log('user_added', { userId: user.id, name: user.name, ...requestInfo(req) });
    return user;
  });
  res.json({
    ...adminView(data),
    added: { id: result.id, name: result.name, defaultPin: result.defaultPin, startPin: chosen ? undefined : pin }
  });
}));

api.delete('/admin/users/:userId', adminOnly, handle(async (req, res) => {
  const { userId } = req.params;
  if (isAdminId(userId)) throw new HttpError(400, 'Das Admin-Konto kann nicht gelöscht werden.');
  const { data } = await mutate((data, log) => {
    const user = data.users.find(u => u.id === userId);
    if (!user) throw new HttpError(404, 'Dieses Mitglied ist schon gelöscht.');
    const contribution = own(data.contributions, userId) || 0;
    const hours = own(data.hours, userId) || 0;
    data.users = data.users.filter(u => u.id !== userId);
    delete data.contributions[userId];
    delete data.grossBids[userId];
    delete data.hours[userId];
    log('user_deleted', { userId, name: user.name, contribution, hours, ...requestInfo(req) });
  });
  clearFailedLogins(userId);
  writeBudgets.delete(userId);
  res.json(adminView(data));
}));

// The admin can set the PIN of every account, including their own.
api.put('/admin/users/:userId/pin', adminOnly, handle(async (req, res) => {
  const pin = requirePin(req.body && req.body.pin);
  const hash = await hashPinLimited(req, pin);
  const { data, result } = await mutate(async (data, log) => {
    const user = data.users.find(u => u.id === req.params.userId);
    if (!user) throw new HttpError(404, 'Dieses Mitglied gibt es nicht mehr.');
    await setPin(user, pin, { hash });
    log('pin_changed', { userId: user.id, by: 'admin', ...requestInfo(req) });
    return user;
  });
  clearFailedLogins(result.id);
  const deviceId = isAdminId(result.id) ? deviceIdOf(req.body.device) : null;
  res.json({
    ...adminView(data),
    session: isAdminId(result.id) ? issueSession(result) : undefined,
    trust: deviceId ? issueTrust(result, deviceId) : undefined
  });
}));

api.put('/admin/target', adminOnly, handle(async (req, res) => {
  const targetAmount = requireAmount(req.body && req.body.targetAmount, 'Der Bedarf');
  if (targetAmount <= 0) throw new HttpError(400, 'Der Bedarf muss größer als 0 sein.');
  const { data } = await mutate((data, log) => {
    log('target_changed', { from: data.targetAmount, to: targetAmount, ...requestInfo(req) });
    data.targetAmount = targetAmount;
  });
  res.json(adminView(data));
}));

// Exports never contain PINs or PIN hashes.
api.get('/admin/export', adminOnly, handle(async (req, res) => {
  const data = req.data;
  res.json({
    users: data.users.filter(u => !isAdminId(u.id)).map(u => ({ id: u.id, name: u.name })),
    contributions: data.contributions,
    contributionsGross: Object.fromEntries(Object.keys(data.contributions).map(id => [id, grossOf(data, id)])),
    // Bids typed brutto: there the brutto amount is leading.
    enteredAs: Object.fromEntries(Object.keys(data.contributions).map(id => [id, own(data.grossBids, id) > 0 ? 'brutto' : 'netto'])),
    hours: data.hours,
    targetAmount: data.targetAmount,
    exportDate: new Date().toISOString()
  });
}));

// Replaces all members and bids (the admin account stays). Members are matched to
// existing ones by id or name: without a PIN in the file they keep their PIN,
// new members get the default PIN.
// Ids from a file: the usual pattern, but never the admin's or a name like "constructor"
// that every JavaScript object already has.
const usableId = (id) => ID_PATTERN.test(id) && !isAdminId(id) && !(id in Object.prototype);

api.post('/admin/import', adminOnly, importJson, handle(async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.users)) throw new HttpError(400, 'Die Datei enthält keine Mitgliederliste.');
  if (body.users.length > MAX_IMPORT_ENTRIES) {
    throw new HttpError(400, `Die Datei enthält mehr als ${MAX_IMPORT_ENTRIES} Einträge.`);
  }
  const contributionsIn = body.contributions && typeof body.contributions === 'object' ? body.contributions : {};
  const grossIn = body.contributionsGross && typeof body.contributionsGross === 'object' ? body.contributionsGross : {};
  const enteredAsIn = body.enteredAs && typeof body.enteredAs === 'object' ? body.enteredAs : {};
  const hoursIn = body.hours && typeof body.hours === 'object' ? body.hours : {};
  const hasTarget = body.targetAmount !== undefined && body.targetAmount !== null && body.targetAmount !== '';
  const targetAmount = hasTarget ? requireAmount(body.targetAmount, 'Der Bedarf') : null;

  const entries = body.users
    .filter(u => u && !isAdminId(u.id))
    .map((u, i) => {
      const where = Number.isInteger(u.line) ? `Zeile ${u.line}` : `Eintrag ${i + 1}`;
      const id = u.id !== undefined && u.id !== null ? String(u.id) : '';
      const pinGiven = u.pin !== undefined && u.pin !== null && u.pin !== '';
      const rawAmount = u.contribution !== undefined ? u.contribution : own(contributionsIn, id);
      const amountGiven = rawAmount !== undefined && rawAmount !== null && rawAmount !== '';
      const rawHours = u.hours !== undefined ? u.hours : own(hoursIn, id);
      const hoursGiven = rawHours !== undefined && rawHours !== null && rawHours !== '';
      // A bid typed brutto (from an export) keeps its brutto amount; netto follows from it.
      const enteredAs = u.enteredAs !== undefined ? u.enteredAs : own(enteredAsIn, id);
      const rawGross = u.contributionGross !== undefined ? u.contributionGross : own(grossIn, id);
      const gross = enteredAs === 'brutto' && rawGross !== undefined && rawGross !== null && rawGross !== ''
        ? requireAmount(rawGross, `${where}: Der Bruttobetrag`)
        : 0;
      return {
        where,
        id: usableId(id) ? id : null,
        name: requireName(u.name, where),
        pin: pinGiven ? requirePin(String(u.pin), where) : null,
        contribution: gross > 0 ? toNet(gross) : amountGiven ? requireAmount(rawAmount, `${where}: Der Betrag`) : 0,
        gross,
        hours: hoursGiven ? requireHours(rawHours, `${where}: Die Stunden`) : 0
      };
    });
  entries.forEach((entry, i) => {
    const twin = entries.findIndex(other => sameName(other.name, entry.name));
    if (twin !== i) throw new HttpError(400, `„${entry.name}“ steht doppelt in der Datei (${entries[twin].where} und ${entry.where}).`);
  });

  const { data, result } = await mutate(async (data, log) => {
    await backupBeforeImport();
    const admin = data.users.find(u => isAdminId(u.id));
    const previous = data.users.filter(u => !isAdminId(u.id));
    const used = new Set(['admin']);
    const nextId = idGenerator(id => used.has(id) || previous.some(p => p.id === id));
    const defaultHash = await hashPin(DEFAULT_PIN);
    const users = [];
    const contributions = {};
    const grossBids = {};
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
        await setPin(user, DEFAULT_PIN, { hash: defaultHash });
      }
      users.push(user);
      if (entry.contribution > 0) contributions[user.id] = entry.contribution;
      if (entry.contribution > 0 && entry.gross > 0) grossBids[user.id] = entry.gross;
      if (entry.hours > 0) hours[user.id] = entry.hours;
    }

    const before = summary(data);
    data.users = [admin, ...users];
    data.contributions = contributions;
    data.grossBids = grossBids;
    data.hours = hours;
    if (targetAmount) data.targetAmount = targetAmount;
    const after = summary(data);
    log('import', {
      users: users.length,
      before: { users: previous.length, totalRaised: before.totalRaised, totalHours: before.totalHours },
      totalRaised: after.totalRaised,
      totalHours: after.totalHours,
      ...requestInfo(req)
    });
    return { count: users.length };
  });
  res.json({ ...adminView(data), imported: result.count });
}));

api.use((req, res) => {
  res.status(404).json({ error: 'Unbekannte Adresse.' });
});

app.use('/api', api);

app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    if (err.retryAfterMs) res.set('Retry-After', String(Math.ceil(err.retryAfterMs / 1000)));
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: req.path === IMPORT_PATH ? 'Die Datei ist zu groß.' : 'Ungültige Anfrage.' });
  }
  // Other client errors (broken JSON, unknown charset, aborted upload, malformed URL):
  // a short answer and no stack trace in the log.
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({ error: 'Ungültige Anfrage.' });
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

module.exports = { app, start, networkOf };

if (require.main === module) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
