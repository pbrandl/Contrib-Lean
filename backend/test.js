// Backend checks: node test.js
// Runs the server on a random port against a throw-away copy of the data.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fundraiser-test-'));
const source = process.argv[2] || path.join(__dirname, 'data', 'database.json');
if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dataDir, 'database.json'));
process.env.DATA_DIR = dataDir;
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';

const { start } = require('./server');

let base;
const results = [];

async function call(method, url, { token, body, ip } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['X-Forwarded-For'] = ip;
  const res = await fetch(`${base}/api${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
}

async function check(name, fn) {
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

  const adminLogin = await call('POST', '/login', { body: { userId: 'admin', pin: '0000' } });
  await check('admin logs in with the existing PIN', async () => {
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.body.role, 'admin');
  });
  let admin = adminLogin.body.token;

  const added = await call('POST', '/admin/users', { token: admin, body: { name: 'Test Bieterin' } });
  const memberId = added.body.added.id;
  await check('admin adds a member with default PIN', async () => {
    assert.equal(added.status, 200);
    assert.equal(added.body.added.defaultPin, true);
    assert.equal((await call('POST', '/admin/users', { token: admin, body: { name: 'test bieterin' } })).status, 409);
  });

  const memberLogin = await call('POST', '/login', { body: { userId: memberId, pin: '1234' } });
  const member = memberLogin.body.token;

  await check('member session cannot use admin endpoints', async () => {
    assert.equal(memberLogin.status, 200);
    assert.equal((await call('GET', '/admin/data', { token: member })).status, 401);
  });

  await check('200 parallel clicks: no bid is lost', async () => {
    const clicks = Array.from({ length: 200 }, (_, i) => (i % 4 === 3 ? 10 : 5));
    const expected = clicks.reduce((a, b) => a + b, 0);
    const responses = await Promise.all(clicks.map(delta => call('POST', '/me/contribution', { token: member, body: { delta } })));
    assert.ok(responses.every(r => r.status === 200));
    const me = await call('GET', '/me', { token: member });
    assert.equal(me.body.contribution, expected);
    assert.equal(db().contributions[memberId], expected);
  });

  await check('parallel bids of two members plus admin changes stay consistent', async () => {
    const second = await call('POST', '/admin/users', { token: admin, body: { name: 'Zweiter Bieter' } });
    const t2 = (await call('POST', '/login', { body: { userId: second.body.added.id, pin: '1234' } })).body.token;
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

  await check('hours per month: set, round to half hours, validate, sum', async () => {
    const before = (await call('GET', '/public')).body.totalHours;
    let res = await call('PUT', '/me/hours', { token: member, body: { hours: 7.3 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.hours, 7.5);
    assert.equal(res.body.totalHours, before + 7.5);
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
    assert.equal((await call('POST', '/login', { ip, body: { userId: memberId, pin: '1234' } })).status, 429);
  });

  await check('the lock does not affect other devices', async () => {
    assert.equal((await call('POST', '/login', { ip: '198.51.100.9', body: { userId: memberId, pin: '1234' } })).status, 200);
  });

  await check('admin PIN reset lifts the lock and ends old sessions', async () => {
    const res = await call('PUT', `/admin/users/${memberId}/pin`, { token: admin, body: { pin: '5678' } });
    assert.equal(res.status, 200);
    assert.equal((await call('GET', '/me', { token: member })).status, 401);
    assert.equal((await call('POST', '/login', { ip: '203.0.113.7', body: { userId: memberId, pin: '5678' } })).status, 200);
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
    const res = await call('PUT', '/admin/users/admin/pin', { token: admin, body: { pin: '4711' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.admin.defaultPin, false);
    assert.equal((await call('GET', '/admin/data', { token: admin })).status, 401);
    admin = res.body.session.token;
    assert.equal((await call('GET', '/admin/data', { token: admin })).status, 200);
    assert.equal((await call('POST', '/login', { body: { userId: 'admin', pin: '0000' } })).status, 401);
  });

  await check('export has bids and hours but no PINs', async () => {
    const res = await call('GET', '/admin/export', { token: admin });
    assert.equal(res.status, 200);
    assert.ok(res.body.contributions && res.body.users.length > 0);
    assert.equal(res.body.hours[memberId], 6);
    assert.doesNotMatch(res.raw, /pin|scrypt/i);
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

  await check('audit log records every bid', async () => {
    const lines = fs.readFileSync(path.join(dataDir, 'audit.log'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
    assert.ok(lines.filter(l => l.event === 'bid').length >= 300);
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
