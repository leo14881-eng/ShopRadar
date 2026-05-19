/**
 * 本地测试：将设备标记为 Pro（模拟 Lemon Webhook 成功）
 * Usage: node scripts/grant-pro.js <device_id>
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const deviceId = process.argv[2];

if (!deviceId) {
  console.error('Usage: node scripts/grant-pro.js <device_id>');
  process.exit(1);
}

function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

const db = new sqlite3.Database(DB_PATH);

db.get(
  'SELECT device_id, is_pro, count, last_query_date FROM users WHERE device_id = ?',
  [deviceId],
  function (err, row) {
    if (err) {
      console.error(err);
      db.close();
      process.exit(1);
    }

    const today = getToday();
    const done = function () {
      db.get(
        'SELECT device_id, is_pro, count, last_query_date FROM users WHERE device_id = ?',
        [deviceId],
        function (err2, after) {
          if (err2) {
            console.error(err2);
          } else {
            console.log('Pro 已开通:', after);
          }
          db.close();
        }
      );
    };

    if (row) {
      db.run(
        'UPDATE users SET is_pro = 1 WHERE device_id = ?',
        [deviceId],
        function (err3) {
          if (err3) {
            console.error(err3);
            db.close();
            process.exit(1);
          }
          done();
        }
      );
    } else {
      db.run(
        'INSERT INTO users (device_id, count, last_query_date, is_pro) VALUES (?, 0, ?, 1)',
        [deviceId, today],
        function (err4) {
          if (err4) {
            console.error(err4);
            db.close();
            process.exit(1);
          }
          done();
        }
      );
    }
  }
);
