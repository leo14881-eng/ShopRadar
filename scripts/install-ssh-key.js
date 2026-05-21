'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require(process.argv[2]);

const cfg = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const pubKey = fs.readFileSync(process.argv[4], 'utf8').trim();
const cmd = [
  'mkdir -p ~/.ssh',
  'chmod 700 ~/.ssh',
  `grep -F '${pubKey.replace(/'/g, `'\\''`)}' ~/.ssh/authorized_keys >/dev/null 2>&1 || echo '${pubKey.replace(/'/g, `'\\''`)}' >> ~/.ssh/authorized_keys`,
  'chmod 600 ~/.ssh/authorized_keys',
  'echo KEY_INSTALLED',
].join(' && ');

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err.message || err);
        process.exit(1);
      }
      let out = '';
      stream.on('data', (d) => { out += d; });
      stream.on('close', (code) => {
        console.log(out.trim() || (code === 0 ? 'KEY_INSTALLED' : 'FAILED'));
        conn.end();
        process.exit(code === 0 ? 0 : 1);
      });
    });
  })
  .on('error', (err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .connect({
    host: cfg.host,
    port: cfg.port || 22,
    username: cfg.username,
    password: cfg.password,
    readyTimeout: 20000,
  });
