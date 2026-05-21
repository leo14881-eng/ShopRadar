'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require(process.argv[4]);

const cfgPath = process.argv[2];
const root = process.argv[3];
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const remoteBase = cfg.remotePath.replace(/\/$/, '');

function resolveKeyPath(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(require('os').homedir(), p.slice(2));
  return p;
}

const UPLOAD_DIRS = ['shopradar-server', 'shopradar-website'];
const SKIP = new Set(['node_modules', '.git', '.cursor', '.idea', 'database.sqlite']);

function shouldSkip(name) {
  return SKIP.has(name) || name.startsWith('database.sqlite-');
}

function collectFiles(localDir, base = localDir) {
  const out = [];
  for (const ent of fs.readdirSync(localDir, { withFileTypes: true })) {
    if (shouldSkip(ent.name)) continue;
    const full = path.join(localDir, ent.name);
    if (ent.isDirectory()) out.push(...collectFiles(full, base));
    else out.push({ local: full, rel: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

function connect() {
  return new Promise((resolve, reject) => {
    const c = new Client();
    c.on('ready', () => resolve(c));
    c.on('error', reject);
    const opts = {
      host: cfg.host,
      port: cfg.port || 22,
      username: cfg.username,
      readyTimeout: 20000,
    };
    if (cfg.privateKeyPath) {
      opts.privateKey = fs.readFileSync(resolveKeyPath(cfg.privateKeyPath));
    } else if (cfg.password) {
      opts.password = cfg.password;
    }
    c.connect(opts);
  });
}

function sftpMkdirs(sftp, dir) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(dir, { mode: 0o755 }, (err) => {
      if (!err || err.code === 4) return resolve();
      reject(err);
    });
  });
}

function sftpPut(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()));
  });
}

async function ensureRemoteDir(sftp, remoteDir) {
  const parts = remoteDir.split('/').filter(Boolean);
  let cur = '';
  for (const p of parts) {
    cur += '/' + p;
    await sftpMkdirs(sftp, cur);
  }
}

async function main() {
  console.log('连接', cfg.host, '...');
  const conn = await connect();
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });

  let total = 0;
  for (const dir of UPLOAD_DIRS) {
    const localRoot = path.join(root, dir);
    if (!fs.existsSync(localRoot)) {
      console.warn('跳过（不存在）:', dir);
      continue;
    }
    const files = collectFiles(localRoot);
    console.log(`上传 ${dir}/ (${files.length} 个文件)...`);
    for (const { local, rel } of files) {
      const remote = `${remoteBase}/${dir}/${rel}`.replace(/\\/g, '/');
      await ensureRemoteDir(sftp, path.posix.dirname(remote));
      await sftpPut(sftp, local, remote);
      total += 1;
      if (total % 50 === 0) process.stdout.write(`  ${total} files\r`);
    }
  }

  conn.end();
  console.log(`\n完成，共上传 ${total} 个文件。`);
}

main().catch((err) => {
  console.error('部署失败:', err.message || err);
  process.exit(1);
});
