/**
 * Reset Pro status for a device (local testing)
 * Usage:
 *   node scripts/reset-pro.js
 *   node scripts/reset-pro.js c8bf6c26-b34d-4a4d-8713-89d14e3ca375
 *   node scripts/reset-pro.js --delete c8bf6c26-...
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const deviceId = process.argv[2] === '--delete' ? process.argv[3] : process.argv[2];
const deleteRow = process.argv[2] === '--delete';

if (!deviceId) {
  console.error('Usage: node scripts/reset-pro.js <device_id>');
  console.error('       node scripts/reset-pro.js --delete <device_id>');
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);

function run(sql, params) {
  return new Promise(function (resolve, reject) {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ changes: this.changes });
    });
  });
}

function get(sql, params) {
  return new Promise(function (resolve, reject) {
    db.get(sql, params, function (err, row) {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

(async function () {
  const before = await get(
    'SELECT device_id, is_pro, count, last_query_date FROM users WHERE device_id = ?',
    [deviceId]
  );

  if (!before) {
    console.log('No row for device_id:', deviceId);
    db.close();
    return;
  }

  console.log('Before:', before);

  if (deleteRow) {
    await run('DELETE FROM users WHERE device_id = ?', [deviceId]);
    console.log('Deleted user row (Pro off + daily count reset).');
  } else {
    await run('UPDATE users SET is_pro = 0 WHERE device_id = ?', [deviceId]);
    console.log('Set is_pro = 0 (still counts as existing user for daily limit).');
  }

  const after = await get(
    'SELECT device_id, is_pro, count, last_query_date FROM users WHERE device_id = ?',
    [deviceId]
  );
  console.log('After:', after || '(row removed)');

  db.close();
})().catch(function (err) {
  console.error(err);
  db.close();
  process.exit(1);
});
