// Backend checks: node test.js
// Runs the server on a random port against a throw-away copy of the data.
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fundraiser-test-'));
const source = process.argv[2] || path.join(__dirname, 'data', 'database.json');
if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dataDir, 'database.json'));
process.env.DATA_DIR = dataDir;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

// Lock times are minutes to hours; the checks move the server's clock forward instead of waiting.
const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;
const advance = (ms) => { clockOffset += ms; };

const { start } = require('./server');

let base;
const results = [];

const testDevice = crypto.randomBytes(16).toString('base64url');

async function call(method, url, { token, body, ip, oldPage = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  if (!oldPage) headers['X-Device'] = testDevice; // like the current frontend
  const res = await fetch(`${base}/api${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text, retryAfter: Number(res.headers.get('retry-after')) || 0 };
}

// A new browser: a random device id like the frontend's, and a fresh address
// (alternating IPv6 /64s and IPv4).
const newDevice = () => crypto.randomBytes(16).toString('base64url');
let lastIp = 0;
const newIp = () => {
  lastIp += 1;
  return lastIp % 2 ? `2001:db8:${lastIp.toString(16)}::1` : `192.0.2.${lastIp % 250}`;
};
const statuses = (responses) => responses.map(r => r.status);

async function check(name, fn) {
  advance(10 * 1000); // refills the write budgets (10 per second), far below every login lock
  try {
    await fn();
    results.push(['ok', name]);
  } catch (error) {
    results.push(['FAIL', name, error.message]);
  }
}

(async () => {
  const server = await start();
  base = `http://127.0.0.1:${server.address().port}`;
  const db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8'));

  await check('migration hashes every PIN and keeps all users', async () => {
    const data = db();
    assert.ok(data.users.length >= 1);
    for (const u of data.users) {
      assert.equal(u.pin, undefined);
      assert.match(u.pinHash, /^scrypt\$/);
    }
    assert.ok(!fs.existsSync(path.join(dataDir, 'backups')), 'no backup with plain-text PINs');
  });

  await check('public endpoints never expose PINs', async () => {
    for (const url of ['/public', '/health']) {
      const res = await call('GET', url);
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.raw, /pin"|pinHash|scrypt/i);
    }
  });

  await check('old open endpoints are gone', async () => {
    for (const [m, u] of [['GET', '/data'], ['GET', '/users'], ['GET', '/export'], ['POST', '/import'], ['PUT', '/target']]) {
      assert.equal((await call(m, u, { body: m === 'GET' ? undefined : {} })).status, 404, `${m} ${u}`);
    }
  });

  await check('admin endpoints require the admin session', async () => {
    assert.equal((await call('GET', '/admin/data')).status, 401);
    assert.equal((await call('POST', '/admin/import', { body: { users: [] } })).status, 401);
    assert.equal((await call('GET', '/admin/data', { token: 'forged.token' })).status, 401);
  });

  const adminDevice = newDevice();
  const adminLogin = await call('POST', '/login', { body: { userId: 'admin', pin: '0000', device: adminDevice } });
  await check('admin logs in with the existing PIN', async () => {
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.body.role, 'admin');
    assert.equal(typeof adminLogin.body.trust, 'string');
  });
  let admin = adminLogin.body.token;
  let adminTrust = adminLogin.body.trust;

  const added = await call('POST', '/admin/users', { token: admin, body: { name: 'Test Bieterin' } });
  const memberId = added.body.added.id;
  const memberPin = added.body.added.startPin;
  await check('admin adds a member with a random start PIN that is shown once', async () => {
    assert.equal(added.status, 200);
    assert.equal(added.body.added.defaultPin, true);
    assert.match(memberPin, /^\d{4}$/);
    assert.notEqual(memberPin, '1234');
    assert.equal(added.body.users.find(u => u.id === memberId).defaultPin, true);
    assert.doesNotMatch(JSON.stringify(added.body.users), /startPin|pinHash/);
    assert.equal((await call('POST', '/admin/users', { token: admin, body: { name: 'test bieterin' } })).status, 409);
    const pins = new Set();
    for (let i = 0; i < 5; i += 1) {
      pins.add((await call('POST', '/admin/users', { token: admin, body: { name: `Zufall ${i}` } })).body.added.startPin);
    }
    assert.ok(pins.size >= 4, 'start PINs differ');
    const chosen = await call('POST', '/admin/users', { token: admin, body: { name: 'Mit PIN', pin: '2222' } });
    assert.equal(chosen.body.added.startPin, undefined);
    // An admin page from before the update (no X-Device) says "Start-PIN: 1234", so it gets 1234.
    const old = await call('POST', '/admin/users', { token: admin, body: { name: 'Alte Seite' }, oldPage: true });
    assert.equal(old.body.added.startPin, '1234');
    assert.equal(old.body.added.defaultPin, true);
    assert.equal((await call('POST', '/login', { body: { userId: old.body.added.id, pin: '1234' } })).status, 200);
    assert.equal((await call('POST', '/login', { body: { userId: added.body.added.id, pin: '1234' } })).status, 401);
    const raw = fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8');
    assert.ok(!raw.includes(`"${memberPin}"`), 'start PIN is not stored in plain text');
  });

  const memberLogin = await call('POST', '/login', { body: { userId: memberId, pin: memberPin } });
  const member = memberLogin.body.token;

  await check('member session cannot use admin endpoints', async () => {
    assert.equal(memberLogin.status, 200);
    assert.equal((await call('GET', '/admin/data', { token: member })).status, 401);
  });

  await check('200 parallel clicks: every accepted bid counts, the flood beyond the write budget gets 429', async () => {
    const clicks = Array.from({ length: 200 }, (_, i) => (i % 4 === 3 ? 10 : 5));
    const responses = await Promise.all(clicks.map(delta => call('POST', '/me/contribution', { token: member, body: { delta } })));
    assert.ok(responses.every(r => r.status === 200 || r.status === 429));
    const accepted = clicks.filter((_, i) => responses[i].status === 200);
    assert.ok(accepted.length >= 50 && accepted.length < 200, `${accepted.length} accepted`);
    assert.match(responses.find(r => r.status === 429).body.error, /Zu viele Änderungen/);
    const expected = accepted.reduce((a, b) => a + b, 0);
    const me = await call('GET', '/me', { token: member });
    assert.equal(me.body.contribution, expected);
    assert.equal(db().contributions[memberId], expected);
  });

  await check('parallel bids of two members plus admin changes stay consistent', async () => {
    const second = await call('POST', '/admin/users', { token: admin, body: { name: 'Zweiter Bieter' } });
    const t2 = (await call('POST', '/login', { body: { userId: second.body.added.id, pin: second.body.added.startPin } })).body.token;
    const before = (await call('GET', '/me', { token: member })).body.contribution;
    await Promise.all([
      ...Array.from({ length: 50 }, () => call('POST', '/me/contribution', { token: member, body: { delta: 1 } })),
      ...Array.from({ length: 50 }, () => call('POST', '/me/contribution', { token: t2, body: { delta: 2 } })),
      call('PUT', '/admin/target', { token: admin, body: { targetAmount: 7000 } }),
      call('POST', '/admin/users', { token: admin, body: { name: 'Dritte' } })
    ]);
    const data = db();
    assert.equal(data.contributions[memberId], before + 50);
    assert.equal(data.contributions[second.body.added.id], 100);
    assert.equal(data.targetAmount, 7000);
    assert.ok(data.users.some(u => u.name === 'Dritte'));
  });

  await check('a bid never goes below 0 and invalid values are rejected', async () => {
    const res = await call('POST', '/me/contribution', { token: member, body: { delta: -10000 } });
    assert.equal(res.body.contribution, 0);
    for (const delta of ['5', null, NaN, 0, 1e9]) {
      assert.equal((await call('POST', '/me/contribution', { token: member, body: { delta } })).status, 400, String(delta));
    }
    assert.equal((await call('PUT', '/admin/target', { token: admin, body: { targetAmount: 'viel' } })).status, 400);
  });

  await check('withdraw sets the bid to 0', async () => {
    await call('POST', '/me/contribution', { token: member, body: { delta: 25 } });
    const res = await call('POST', '/me/contribution/withdraw', { token: member });
    assert.equal(res.body.contribution, 0);
  });

  await check('the bid is set as a fixed amount (netto); the step route of old pages still works', async () => {
    let res = await call('PUT', '/me/contribution', { token: member, body: { amount: 10.87 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.contribution, 10.87);
    assert.equal((await call('PUT', '/me/contribution', { token: member, body: { amount: 10.87 } })).body.contribution, 10.87, 'same amount again');
    assert.equal((await call('PUT', '/me/contribution', { token: member, body: { amount: '1585.5' } })).body.contribution, 1585.5);
    assert.equal((await call('PUT', '/me/contribution', { token: member, body: { amount: 12.345 } })).body.contribution, 12.35, 'cents');
    for (const amount of [-1, 'viel', 1000001, null, '1e3', '0x10']) {
      assert.equal((await call('PUT', '/me/contribution', { token: member, body: { amount } })).status, 400, JSON.stringify(amount));
    }
    assert.equal((await call('PUT', '/me/contribution', { body: { amount: 5 } })).status, 401);
    res = await call('PUT', '/me/contribution', { token: member, body: { amount: 0 } });
    assert.equal(res.body.contribution, 0);
    assert.equal(db().contributions[memberId], undefined);
    assert.equal((await call('POST', '/me/contribution', { token: member, body: { delta: 5 } })).body.contribution, 5, 'old page');
    assert.equal((await call('POST', '/me/contribution/withdraw', { token: member })).body.contribution, 0, 'old page');
    const lines = fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.ok(lines.some(l => l.event === 'bid' && l.from === 10.87 && l.to === 1585.5));
  });

  await check('hours per month: set, round to one decimal, validate, sum', async () => {
    const before = (await call('GET', '/public')).body.totalHours;
    let res = await call('PUT', '/me/hours', { token: member, body: { hours: 7.34 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.hours, 7.3);
    assert.equal(res.body.totalHours, before + 7.3);
    res = await call('PUT', '/me/hours', { token: member, body: { hours: '4,5' } });
    assert.equal(res.body.hours, 4.5);
    for (const hours of [-1, 'viel', 1000, null]) {
      assert.equal((await call('PUT', '/me/hours', { token: member, body: { hours } })).status, 400, String(hours));
    }
    assert.equal((await call('PUT', '/me/hours', { body: { hours: 3 } })).status, 401);
    assert.equal(db().hours[memberId], 4.5);
    assert.equal((await call('GET', '/public')).body.totalHours, before + 4.5);
    res = await call('PUT', '/me/hours', { token: member, body: { hours: 0 } });
    assert.equal(db().hours[memberId], undefined);
    await call('PUT', '/me/hours', { token: member, body: { hours: 6 } });
  });

  await check('5 wrong PINs lock the login, also for the right PIN', async () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('POST', '/login', { ip, body: { userId: memberId, pin: '9999' } })).status, 401);
    }
    assert.equal((await call('POST', '/login', { ip, body: { userId: memberId, pin: memberPin } })).status, 429);
  });

  await check('the lock does not affect other devices', async () => {
    assert.equal((await call('POST', '/login', { ip: '198.51.100.9', body: { userId: memberId, pin: memberPin } })).status, 200);
  });

  const addMember = async (name, pin) => (await call('POST', '/admin/users', { token: admin, body: { name, pin } })).body.added.id;
  const wlan = '198.51.100.20';
  const phoneA = newDevice();
  let beaId;

  await check('wrong PINs on one phone do not lock another phone in the same WLAN', async () => {
    const bea = await addMember('Bea', '2580');
    beaId = bea;
    const phoneB = newDevice();
    const wrong = [];
    for (let i = 0; i < 5; i += 1) wrong.push(await call('POST', '/login', { ip: wlan, body: { userId: bea, pin: '1111', device: phoneA } }));
    assert.deepEqual(statuses(wrong), [401, 401, 401, 401, 401]);
    assert.match(wrong[0].body.error, /Noch 4 Versuche/);
    assert.match(wrong[4].body.error, /in einer Minute/);
    const locked = await call('POST', '/login', { ip: wlan, body: { userId: bea, pin: '2580', device: phoneA } });
    assert.equal(locked.status, 429);
    assert.ok(locked.retryAfter > 0 && locked.retryAfter <= 60);
    const owner = await call('POST', '/login', { ip: wlan, body: { userId: bea, pin: '2580', device: phoneB } });
    assert.equal(owner.status, 200);
    assert.equal(typeof owner.body.trust, 'string');
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: memberId, pin: memberPin, device: phoneA } })).status, 200);
  });

  await check('old pages without device id fall back to the network, IPv6 grouped by /64', async () => {
    const cem = await addMember('Cem', '1357');
    for (const ip of ['2001:db8:1:2::a', '2001:db8:1:2::b', '2001:db8:1:2::a', '2001:db8:1:2:ffff::1', '2001:db8:1:2::b']) {
      assert.equal((await call('POST', '/login', { ip, body: { userId: cem, pin: '0000' } })).status, 401);
    }
    assert.equal((await call('POST', '/login', { ip: '2001:db8:1:2::c', body: { userId: cem, pin: '1357' } })).status, 429);
    assert.equal((await call('POST', '/login', { ip: '2001:db8:1:2::c', body: { userId: cem, pin: '1357', device: 'kaputt' } })).status, 429);
    const other = await call('POST', '/login', { ip: '2001:db8:1:3::1', body: { userId: cem, pin: '1357' } });
    assert.equal(other.status, 200);
    assert.equal(other.body.trust, undefined);
    assert.equal((await call('POST', '/login', { ip: '2001:db8:1:2::c', body: { userId: cem, pin: '1357', device: newDevice() } })).status, 200);
    assert.equal((await call('POST', '/login', { ip: '2001:db8:1:2::c', body: { userId: cem, pin: '12' } })).status, 400);
  });

  const attackNet = '203.0.113.66';

  await check('attacker on one network: 20 wrong PINs, then only trusted devices from there; the owner elsewhere is not blocked', async () => {
    const dora = await addMember('Dora', '8642');
    const doraPhone = newDevice();
    const first = await call('POST', '/login', { ip: '192.0.2.200', body: { userId: dora, pin: '8642', device: doraPhone } });
    assert.equal(first.status, 200);
    const attack = [];
    for (let i = 0; i < 25; i += 1) {
      attack.push(await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: String(1000 + i), device: newDevice() } }));
    }
    assert.deepEqual(statuses(attack), [...Array(20).fill(401), ...Array(5).fill(429)]);
    assert.match(attack[24].body.error, /neuen Geräten/);
    assert.ok(attack[24].retryAfter > 0 && attack[24].retryAfter <= 18 * 60);
    assert.equal((await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '8642', device: newDevice() } })).status, 429);
    // The meeting's WLAN has its own budget: Dora gets in on a new phone there.
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: dora, pin: '8642', device: newDevice() } })).status, 200);
    assert.equal((await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '8642', device: newDevice(), trust: first.body.trust } })).status, 429, 'credential of another browser');
    assert.equal((await call('GET', '/me', { token: first.body.trust })).status, 401, 'credential is no session');
    const back = await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '8642', device: doraPhone, trust: first.body.trust } });
    assert.equal(back.status, 200, 'trusted phone gets in even from the drained network');
    // The trusted phone keeps its own lock: 5 wrong PINs, then 429.
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: dora, pin: '0001', device: doraPhone, trust: back.body.trust } })).status, 401);
    }
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: dora, pin: '8642', device: doraPhone, trust: back.body.trust } })).status, 429);
    // A new PIN from the admin lifts all of it; the old credential ends with the old PIN.
    assert.equal((await call('PUT', `/admin/users/${dora}/pin`, { token: admin, body: { pin: '9753' } })).status, 200);
    assert.equal((await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '9753', device: newDevice() } })).status, 200);
    for (let i = 0; i < 20; i += 1) await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '0002', device: newDevice() } });
    assert.equal((await call('POST', '/login', { ip: attackNet, body: { userId: dora, pin: '9753', device: doraPhone, trust: back.body.trust } })).status, 429, 'credential from before the new PIN');
  });

  await check('attacker rotating networks: at most 100 guesses per account, the admin\'s network stays open', async () => {
    const gus = await addMember('Gus', '6420');
    const attack = [];
    for (let i = 0; i < 105; i += 1) {
      attack.push(await call('POST', '/login', { ip: newIp(), body: { userId: gus, pin: String(2000 + i), device: newDevice() } }));
    }
    assert.equal(attack.filter(r => r.status === 401).length, 100);
    assert.deepEqual(statuses(attack.slice(100)), [429, 429, 429, 429, 429]);
    assert.equal((await call('POST', '/login', { ip: newIp(), body: { userId: gus, pin: '6420', device: newDevice() } })).status, 429);
    // The admin logged in from the loopback network (no forwarded address): it is exempt.
    assert.equal((await call('POST', '/login', { body: { userId: gus, pin: '6420', device: newDevice() } })).status, 200);
  });

  await check('parallel attempts cannot overdraw the budget or pass the own-device lock', async () => {
    const emil = await addMember('Emil', '4826');
    const attack = await Promise.all(Array.from({ length: 40 }, (_, i) => call('POST', '/login', {
      ip: attackNet, body: { userId: emil, pin: String(2000 + i), device: newDevice() }
    })));
    assert.equal(attack.filter(r => r.status === 401).length, 20);
    assert.equal(attack.filter(r => r.status === 429).length, 20);
    const phone = newDevice();
    const same = await Promise.all(Array.from({ length: 8 }, (_, i) => call('POST', '/login', {
      ip: wlan, body: { userId: emil, pin: String(3000 + i), device: phone }
    })));
    assert.ok(same.filter(r => r.status === 401).length <= 2, 'at most a couple are checked');
    assert.ok(same.some(r => r.status === 429 && /noch geprüft/.test(r.body.error)));
  });

  await check('admin PIN reset lifts the lock and ends old sessions', async () => {
    const res = await call('PUT', `/admin/users/${memberId}/pin`, { token: admin, body: { pin: '5678' } });
    assert.equal(res.status, 200);
    assert.equal((await call('GET', '/me', { token: member })).status, 401);
    assert.equal((await call('POST', '/login', { ip: '203.0.113.7', body: { userId: memberId, pin: '5678' } })).status, 200);
  });

  await check('with time: the device lock doubles, a trusted device with 5 wrong PINs counts as new, the budget refills', async () => {
    advance(61 * 1000);
    const again = await call('POST', '/login', { ip: wlan, body: { userId: beaId, pin: '1111', device: phoneA } });
    assert.equal(again.status, 401);
    assert.match(again.body.error, /in 2 Minuten/);
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: beaId, pin: '2580', device: phoneA } })).status, 429);

    const fritz = await addMember('Fritz', '3141');
    const phone = newDevice();
    let trust = (await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: phone } })).body.trust;
    for (let i = 0; i < 20; i += 1) await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: String(4000 + i), device: newDevice() } });
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: newDevice() } })).status, 429);
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '0003', device: phone, trust } })).status, 401);
    }
    advance(61 * 1000);
    const lost = await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: phone, trust } });
    assert.equal(lost.status, 429);
    assert.match(lost.body.error, /neuen Geräten/);
    advance(18 * 60 * 1000);
    const refilled = await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: phone, trust } });
    assert.equal(refilled.status, 200);
    trust = refilled.body.trust;
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '0004', device: newDevice() } })).status, 401);
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: newDevice() } })).status, 429);
    assert.equal((await call('POST', '/login', { ip: wlan, body: { userId: fritz, pin: '3141', device: phone, trust } })).status, 200);
  });

  await check('member changes own PIN and keeps the session', async () => {
    const t = (await call('POST', '/login', { body: { userId: memberId, pin: '5678' } })).body.token;
    const res = await call('PUT', '/me/pin', { token: t, body: { pin: '2468' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.defaultPin, false);
    assert.equal((await call('GET', '/me', { token: res.body.session.token })).status, 200);
    assert.equal((await call('GET', '/me', { token: t })).status, 401);
    assert.equal((await call('PUT', '/me/pin', { token: res.body.session.token, body: { pin: '12' } })).status, 400);
  });

  await check('admin changes the admin PIN', async () => {
    const res = await call('PUT', '/admin/users/admin/pin', { token: admin, body: { pin: '4711', device: adminDevice } });
    assert.equal(res.status, 200);
    assert.equal(res.body.admin.defaultPin, false);
    assert.equal(typeof res.body.trust, 'string');
    assert.notEqual(res.body.trust, adminTrust);
    assert.equal((await call('GET', '/admin/data', { token: admin })).status, 401);
    admin = res.body.session.token;
    adminTrust = res.body.trust;
    assert.equal((await call('GET', '/admin/data', { token: admin })).status, 200);
    assert.equal((await call('POST', '/login', { body: { userId: 'admin', pin: '0000' } })).status, 401);
  });

  await check('API answers carry security headers, also for errors', async () => {
    for (const [method, url, body] of [['GET', '/public'], ['GET', '/nirgends'], ['POST', '/login', { userId: 'admin' }]]) {
      const res = await fetch(`${base}/api${url}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', url);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/, url);
      assert.equal(res.headers.get('cache-control'), 'no-store', url);
    }
    const broken = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"userId":' });
    assert.equal(broken.status, 400);
    assert.equal(broken.headers.get('x-content-type-options'), 'nosniff');
  });

  await check('request bodies are small except for the import, client errors are no 500', async () => {
    const big = await call('POST', '/login', { body: { userId: 'admin', pin: '0000', padding: 'x'.repeat(20000) } });
    assert.equal(big.status, 413);
    const badUrl = await fetch(`${base}/api/admin/users/%E0%A4%A`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
    assert.equal(badUrl.status, 400);
    const charset = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=klingonisch' }, body: '{}' });
    assert.equal(charset.status, 415);
    const tooMany = await call('POST', '/admin/import', { token: admin, body: { users: Array.from({ length: 5001 }, (_, i) => ({ name: `N${i}` })) } });
    assert.equal(tooMany.status, 400);
    assert.match(tooMany.body.error, /mehr als 5000/);
    assert.equal((await call('POST', '/admin/import', { body: { users: [], padding: 'x'.repeat(20000) } })).status, 401, 'no big body without admin session');
  });

  // The member's PIN is 2468 since 'member changes own PIN'; older tokens are void.
  const memberNow = async () => (await call('POST', '/login', { body: { userId: memberId, pin: '2468' } })).body.token;

  await check('numbers only as decimals, names without invisible characters', async () => {
    const member = await memberNow();
    for (const hours of ['0x10', '1e2', '0b11', ' ', '']) {
      assert.equal((await call('PUT', '/me/hours', { token: member, body: { hours } })).status, 400, JSON.stringify(hours));
    }
    for (const targetAmount of ['1e3', '0x10', 'Infinity']) {
      assert.equal((await call('PUT', '/admin/target', { token: admin, body: { targetAmount } })).status, 400, targetAmount);
    }
    assert.equal((await call('PUT', '/admin/target', { token: admin, body: { targetAmount: '7000' } })).status, 200);
    const zoe = await call('POST', '/admin/users', { token: admin, body: { name: 'Zo\u00eb' } });
    assert.equal(zoe.status, 200);
    assert.equal((await call('POST', '/admin/users', { token: admin, body: { name: 'Zoe\u0308' } })).status, 409, 'NFD look-alike');
    assert.equal((await call('POST', '/admin/users', { token: admin, body: { name: 'Z\u200bo\u00eb' } })).status, 409, 'zero-width look-alike');
    const bidi = await call('POST', '/admin/users', { token: admin, body: { name: 'Max\u202e  Muster' } });
    assert.equal(bidi.body.added.name, 'Max Muster');
  });

  await check('a script cannot flood the write queue', async () => {
    const member = await memberNow();
    const res = await Promise.all(Array.from({ length: 80 }, () => call('PUT', '/me/hours', { token: member, body: { hours: 6 } })));
    assert.ok(res.every(r => r.status === 200 || r.status === 429));
    assert.ok(res.filter(r => r.status === 200).length >= 50);
    assert.ok(res.filter(r => r.status === 429).length > 0);
    advance(10 * 1000);
    assert.equal((await call('PUT', '/me/hours', { token: member, body: { hours: 6 } })).status, 200);
  });

  await check('a bid step sent again with the same id counts once', async () => {
    const member = await memberNow();
    const before = (await call('GET', '/me', { token: member })).body.contribution;
    const step = { delta: 5, request: 'schritt-0001' };
    assert.equal((await call('POST', '/me/contribution', { token: member, body: step })).body.contribution, before + 5);
    assert.equal((await call('POST', '/me/contribution', { token: member, body: step })).body.contribution, before + 5, 'retry');
    const both = await Promise.all([1, 2].map(() => call('POST', '/me/contribution', { token: member, body: { delta: 10, request: 'schritt-0002' } })));
    assert.ok(both.every(r => r.status === 200));
    assert.equal((await call('GET', '/me', { token: member })).body.contribution, before + 15);
    assert.equal((await call('POST', '/me/contribution', { token: member, body: { delta: 1, request: 'x' } })).body.contribution, before + 16, 'invalid id: counted like a step without id');
    assert.doesNotMatch(JSON.stringify((await call('GET', '/admin/export', { token: admin })).body), /schritt/);
  });

  await check('import ignores ids that every object has, so no bid is lost', async () => {
    const res = await call('POST', '/admin/import', {
      token: admin,
      body: {
        users: [{ id: 'constructor', name: 'Konstantin' }, { id: '__proto__', name: 'Proto' }, { id: 'admin', name: 'Kein Admin' }, { id: memberId, name: 'Test Bieterin' }],
        contributions: { ...JSON.parse('{"constructor": 7, "__proto__": 8}'), [memberId]: 25 },
        hours: { [memberId]: 6 }
      }
    });
    assert.equal(res.status, 200);
    const data = db();
    const ids = data.users.map(u => u.id);
    assert.ok(!ids.includes('constructor') && !ids.includes('__proto__'));
    assert.equal(ids.filter(id => id === 'admin').length, 1);
    assert.equal(data.contributions[memberId], 25);
    const byName = (name) => data.contributions[data.users.find(u => u.name === name).id];
    assert.equal(byName('Konstantin'), 7);
    assert.equal(byName('Proto'), 8);
    assert.equal(Object.keys(data.contributions).length, 3);
  });

  await check('responses carry the server start id, backups are made every hour', async () => {
    const pub = await call('GET', '/public');
    assert.match(pub.body.boot, /^[A-Za-z0-9_-]{8}$/);
    const files = fs.readdirSync(path.join(dataDir, 'backups'));
    assert.ok(files.some(f => /^database-\d{4}-\d{2}-\d{2}-\d{2}h\.json$/.test(f)), files.join(', '));
    assert.ok(files.some(f => /^database-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
  });

  await check('export has bids and hours but no PINs', async () => {
    const res = await call('GET', '/admin/export', { token: admin });
    assert.equal(res.status, 200);
    assert.ok(res.body.contributions && res.body.users.length > 0);
    assert.equal(res.body.hours[memberId], 6);
    assert.deepEqual(Object.keys(res.body.contributionsGross).sort(), Object.keys(res.body.contributions).sort());
    for (const [id, net] of Object.entries(res.body.contributions)) {
      assert.equal(res.body.contributionsGross[id], Math.round((Math.round(net * 100) * 119) / 100) / 100);
    }
    assert.doesNotMatch(res.raw, /pin|scrypt/i);
  });

  await check('a bid typed brutto stays leading: shown, summed and exported as typed, kept by a re-import', async () => {
    const member = await memberNow();
    const gross = (net) => Math.round((Math.round(net * 100) * 119) / 100) / 100;
    let res = await call('PUT', '/me/contribution', { token: member, body: { gross: 10 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.contribution, 8.41, 'netto rounded up');
    assert.equal(res.body.contributionGross, 10, 'not 10.01');
    res = await call('PUT', '/me/contribution', { token: member, body: { gross: 15 } });
    assert.equal(res.body.contribution, 12.61);
    assert.equal(res.body.contributionGross, 15, 'no netto amount gives exactly 15 brutto');
    const others = Object.entries(db().contributions).filter(([id]) => id !== memberId).reduce((sum, [, net]) => sum + gross(net), 0);
    assert.equal(res.body.totalRaisedGross, Math.round((others + 15) * 100) / 100);
    for (const g of [-1, 'viel', 1000001, null]) {
      assert.equal((await call('PUT', '/me/contribution', { token: member, body: { gross: g } })).status, 400, JSON.stringify(g));
    }

    const exp = (await call('GET', '/admin/export', { token: admin })).body;
    assert.equal(exp.contributionsGross[memberId], 15);
    assert.equal(exp.enteredAs[memberId], 'brutto');
    assert.ok(Object.entries(exp.enteredAs).filter(([id]) => id !== memberId).every(([, v]) => v === 'netto'));
    res = await call('POST', '/admin/import', {
      token: admin,
      body: { users: exp.users, contributions: exp.contributions, contributionsGross: exp.contributionsGross, enteredAs: exp.enteredAs, hours: exp.hours }
    });
    assert.equal(res.status, 200);
    assert.equal(db().grossBids[memberId], 15);
    assert.equal(db().contributions[memberId], 12.61);

    res = await call('PUT', '/me/contribution', { token: member, body: { amount: 8.41 } });
    assert.equal(res.body.contributionGross, 10.01, 'a netto bid: brutto follows from netto again');
    assert.equal(db().grossBids[memberId], undefined);
    await call('PUT', '/me/contribution', { token: member, body: { gross: 20 } });
    await call('POST', '/me/contribution', { token: member, body: { delta: 1 } });
    assert.equal(db().grossBids[memberId], undefined, 'a step from an old page drops the brutto amount');
    res = await call('PUT', '/me/contribution', { token: member, body: { gross: 0 } });
    assert.equal(res.body.contribution, 0);
    assert.equal(res.body.contributionGross, 0);
    res = await call('PUT', '/me/contribution', { token: member, body: { amount: 25 } });
    assert.equal(res.body.contributionGross, gross(25));
  });

  await check('import keeps PINs of known members, gives new ones the default PIN', async () => {
    const before = db();
    const known = before.users.find(u => u.id === memberId);
    const res = await call('POST', '/admin/import', {
      token: admin,
      body: { users: [{ name: 'test bieterin', contribution: 40, hours: 3 }, { name: 'Neu, Nora', pin: '1111', contribution: '12.5' }] }
    });
    assert.equal(res.status, 200);
    const data = db();
    assert.equal(data.users.length, 3);
    assert.equal(data.users.find(u => u.id === memberId).pinHash, known.pinHash);
    assert.equal(data.contributions[memberId], 40);
    assert.deepEqual(data.hours, { [memberId]: 3 });
    assert.equal(res.body.totalHours, 3);
    const nora = data.users.find(u => u.name === 'Neu, Nora');
    assert.equal(data.contributions[nora.id], 12.5);
    assert.equal((await call('POST', '/login', { body: { userId: nora.id, pin: '1111' } })).status, 200);
    assert.ok(fs.readdirSync(path.join(dataDir, 'backups')).some(f => f.endsWith('before-import.json')));
  });

  await check('import rejects broken files without changing anything', async () => {
    const before = fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8');
    for (const body of [
      { users: [{ name: 'A', pin: '12' }] },
      { users: [{ name: 'A', contribution: 'viel' }] },
      { users: [{ name: 'A', hours: 900 }] },
      { users: [{ name: 'A' }, { name: 'a' }] },
      { users: [{ name: '' }] },
      { nothing: true }
    ]) {
      assert.equal((await call('POST', '/admin/import', { token: admin, body })).status, 400, JSON.stringify(body));
    }
    const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'database.json'), 'utf8'));
    assert.deepEqual(after.users, JSON.parse(before).users);
  });

  await check('delete removes member and bid; admin cannot be deleted', async () => {
    const res = await call('DELETE', `/admin/users/${memberId}`, { token: admin });
    assert.equal(res.status, 200);
    assert.equal(db().contributions[memberId], undefined);
    assert.equal(db().hours[memberId], undefined);
    assert.equal((await call('DELETE', '/admin/users/admin', { token: admin })).status, 400);
    assert.equal((await call('GET', '/me', { token: member })).status, 401);
  });

  await check('crowd: 100 members on one WLAN with 400 wrong PINs all get in, and so does the admin', async () => {
    const crowdIp = '198.51.100.77';
    let busy = 0;
    const users = Array.from({ length: 100 }, (_, i) => ({ name: `Mitglied ${i + 1}` }));
    const imported = await call('POST', '/admin/import', { token: admin, body: { users } });
    assert.equal(imported.status, 200);
    const started = Date.now();
    const results = await Promise.all(imported.body.users.map(async (u, i) => {
      const device = i < 80 ? newDevice() : undefined; // the last 20 still run the old page
      // Like a person: when the server is busy (503) tap again a moment later.
      const attempt = async (pin) => {
        for (;;) {
          const res = await call('POST', '/login', { ip: crowdIp, body: { userId: u.id, pin, device } });
          if (res.status !== 503) return res.status;
          busy += 1;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      };
      const wrong = [];
      for (let k = 0; k < 4; k += 1) wrong.push(await attempt(String(5000 + k)));
      return { wrong, ok: await attempt('1234') };
    }));
    const typoStatuses = [...new Set(results.flatMap(r => r.wrong))];
    assert.deepEqual(typoStatuses, [401], `every typo is a plain 401, got ${typoStatuses}`);
    assert.ok(results.every(r => r.ok === 200), `every member gets in: ${results.map(r => r.ok).filter(st => st !== 200)}`);
    const adminFromWlan = await call('POST', '/login', { ip: crowdIp, body: { userId: 'admin', pin: '4711', device: newDevice() } });
    assert.equal(adminFromWlan.status, 200);
    console.log(`     crowd: 500 logins in ${Date.now() - started} ms, ${busy} times "server busy" (503) and tried again`);
  });

  await check('admin under attack: 10 wrong PINs per network, 30 overall; the meeting network and the trusted device get in', async () => {
    const attack = [];
    for (let i = 0; i < 12; i += 1) {
      attack.push(await call('POST', '/login', { ip: attackNet, body: { userId: 'admin', pin: String(3000 + i), device: newDevice() } }));
    }
    assert.deepEqual(statuses(attack), [...Array(10).fill(401), 429, 429]);
    assert.match(attack[10].body.error, /Admin-Konto/);
    // The crowd's WLAN is where the admin logged in, so it is exempt from the overall budget.
    assert.equal((await call('POST', '/login', { ip: '198.51.100.77', body: { userId: 'admin', pin: '4711', device: newDevice() } })).status, 200);
    const rotating = [];
    for (let i = 0; i < 25; i += 1) {
      rotating.push(await call('POST', '/login', { ip: newIp(), body: { userId: 'admin', pin: String(3100 + i), device: newDevice() } }));
    }
    assert.equal(rotating.filter(r => r.status === 401).length, 20, '30 overall minus 10 from the attacker network');
    assert.equal((await call('POST', '/login', { ip: newIp(), body: { userId: 'admin', pin: '4711', device: newDevice() } })).status, 429);
    assert.equal((await call('POST', '/login', { ip: '198.51.100.77', body: { userId: 'admin', pin: '4711', device: newDevice() } })).status, 200);
    const trusted = await call('POST', '/login', { ip: newIp(), body: { userId: 'admin', pin: '4711', device: adminDevice, trust: adminTrust } });
    assert.equal(trusted.status, 200);
    assert.equal(trusted.body.role, 'admin');
  });

  await check('audit log records every change in order, with address, browser and device, never a PIN', async () => {
    const raw = fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8');
    const lines = raw.trim().split('\n').map(l => JSON.parse(l));
    const bids = lines.filter(l => l.event === 'bid');
    assert.ok(bids.length >= 100, `${bids.length} bids`);
    for (const l of bids) {
      assert.equal(typeof l.rev, 'number');
      assert.equal(l.ip, '127.0.0.1');
      assert.equal(l.ua, 'node');
    }
    const revs = lines.filter(l => typeof l.rev === 'number').map(l => l.rev);
    assert.deepEqual(revs, [...revs].sort((a, b) => a - b), 'rev never goes back');
    assert.ok(lines.some(l => l.event === 'login' && l.device && l.device.length === 8));
    assert.ok(lines.some(l => l.event === 'login_failed'));
    assert.ok(lines.some(l => l.event === 'user_added'));
    assert.ok(lines.some(l => l.event === 'import' && l.before));
    assert.doesNotMatch(raw, /pinHash|scrypt|startPin|"pin"/);
    assert.ok(!raw.includes(`"${memberPin}"`));
  });

  await check('database file is only readable by the owner', async () => {
    assert.equal(fs.statSync(path.join(dataDir, 'database.json')).mode & 0o777, 0o600);
  });

  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  for (const [status, name, msg] of results) console.log(`${status.padEnd(4)} ${name}${msg ? `\n     ${msg}` : ''}`);
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
