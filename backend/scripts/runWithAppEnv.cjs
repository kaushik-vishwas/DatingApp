/**
 * Cross-platform wrapper: sets APP_ENV then runs a command.
 * Usage: node scripts/runWithAppEnv.cjs test node dist/server.js
 */
const { spawn } = require('child_process');

const appEnv = (process.argv[2] || '').trim();
const cmd = process.argv.slice(3);

if (!appEnv || cmd.length === 0) {
  console.error('Usage: node scripts/runWithAppEnv.cjs <production|test> <command> [args...]');
  process.exit(1);
}

const child = spawn(cmd[0], cmd.slice(1), {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, APP_ENV: appEnv },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
