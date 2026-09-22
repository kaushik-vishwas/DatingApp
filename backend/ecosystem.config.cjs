/**
 * PM2 — run production + test backends on the same EC2 host.
 *
 *   cd backend && npm run build
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Production: DOTENV_CONFIG_PATH=.env      → PORT from .env (5000)
 * Test:       DOTENV_CONFIG_PATH=.env.test → PORT from .env.test (5001)
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
        DOTENV_CONFIG_PATH: '.env',
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
        DOTENV_CONFIG_PATH: '.env.test',
      },
    },
  ],
};
