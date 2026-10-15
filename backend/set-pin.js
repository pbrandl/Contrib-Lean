// Sets a PIN from the command line, e.g. when the admin PIN is lost:
//   supervisorctl stop fundraiser && node set-pin.js admin 4711 && supervisorctl start fundraiser
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [userId, pin] = process.argv.slice(2);
const file = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'database.json');

if (!userId || !/^\d{4,6}$/.test(pin || '')) {
  console.error('Usage: node set-pin.js <userId|admin> <PIN with 4 to 6 digits>');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const user = data.users.find(u => u.id === userId);
if (!user) {
  console.error(`No user with id "${userId}". Ids: ${data.users.map(u => `${u.id} (${u.name})`).join(', ')}`);
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(pin, salt, 32);
user.pinHash = `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
user.pinVersion = (user.pinVersion || 0) + 1;
user.defaultPin = false;
delete user.pin;
data.rev = (data.rev || 0) + 1;

fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2), { mode: 0o600 });
fs.renameSync(`${file}.tmp`, file);
console.log(`New PIN set for ${user.name}.`);
