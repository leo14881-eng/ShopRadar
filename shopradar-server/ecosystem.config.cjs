/** PM2 配置；start.sh 会在 Linux 上自动重装被 SFTP 误传的 Windows node_modules */
module.exports = {
  apps: [
    {
      name: 'shopradar-api',
      script: 'start.sh',
      interpreter: 'bash',
      cwd: '/root/shopradar-backend/shopradar-server',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
