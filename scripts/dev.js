const { spawn } = require('child_process');

const processes = [];

function start(command, args, label) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[dev] ${label} exited with code ${code}. Shutting down...`);
      shutdown(code ?? 1);
    }
  });

  processes.push(child);
}

function shutdown(code = 0) {
  processes.forEach((proc) => {
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('npm', ['run', 'dev:server'], 'server');
start('npm', ['run', 'dev:frontend'], 'frontend');
