/**
 * 重置设备：取消 Pro + 当日次数清零（测试用）
 * Usage: node scripts/reset-quota.js <device_id>
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');
const deviceId = process.argv[2];

if (!deviceId) {
  console.error('Usage: node scripts/reset-quota.js <device_id>');
  process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);
const today = new Date().toISOString().slice(0, 10);

db.run(
  'UPDATE users SET is_pro = 0, count = 0, last_query_date = ? WHERE device_id = ?',
  [today, deviceId],
  function (err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    if (this.changes === 0) {
      console.log('无此 device_id，未修改:', deviceId);
    } else {
      console.log('已重置: is_pro=0, count=0 |', deviceId);
    }
    db.close();
  }
);
