/** PM2 配置（bootstrap 亦会直接用 pm2 start server.js） */
module.exports = {
  apps: [
    {
      name: 'shopradar-api',
      script: 'server.js',
      cwd: '/root/shopradar-backend',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
