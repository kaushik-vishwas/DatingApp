/**
 * PM2 — run production + test backends on the same EC2 host.
 *
 *   cd backend && npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Production: backend/.env      → PORT 5000
 * Test:       backend/.env.test → PORT 5001 (set APP_ENV=test)
 */
module.exports = {
  apps: [
    {
      name: 'selecto-backend',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'production',
      },
    },
    {
      name: 'selecto-backend-test',
      script: 'dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'test',
        APP_ENV: 'test',
      },
    },
  ],
};
