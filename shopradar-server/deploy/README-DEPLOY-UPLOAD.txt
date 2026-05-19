服务器缺少 deploy/ 时，任选一种方式补传：

方式 1 — VS Code SFTP
  右键本地 shopradar-server/deploy → SFTP: Upload Folder

方式 2 — 本机 PowerShell（在项目根目录）
  scp -r shopradar-server/deploy root@192.248.179.25:/root/shopradar-backend/

上传后 SSH 验证：
  ls -la /root/shopradar-backend/deploy/bootstrap.sh

然后执行并网：
  export SHOPRADAR_DOMAIN=api.shopradar.uk
  export CERTBOT_EMAIL=你的邮箱
  bash /root/shopradar-backend/deploy/bootstrap.sh
