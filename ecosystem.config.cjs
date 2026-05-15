module.exports = {
  apps: [
    {
      name: 'crown-backend',
      cwd: '/var/www/crown/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'crown-backend-staging',
      cwd: '/var/www/crown-staging/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
