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
      // Beri waktu graceful shutdown (server.js: drain HTTP/Socket lalu
      // $disconnect, dgn force-exit 10s). Default PM2 1600ms terlalu pendek →
      // SIGKILL sebelum drain selesai. 12s > force-timer internal 10s.
      kill_timeout: 12000,
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
      kill_timeout: 12000,
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
    },
  ],
};
